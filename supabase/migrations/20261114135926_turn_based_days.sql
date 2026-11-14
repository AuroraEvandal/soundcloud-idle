-- Game time is advanced by a single player-locked transaction, never by a clock.
alter table public.players
  add column if not exists game_day int not null default 1 check (game_day>=1),
  add column if not exists game_run int not null default 1 check (game_run>=1),
  add column if not exists debt_remaining int not null default 1000 check (debt_remaining between 0 and 1000),
  add column if not exists debt_overdue int not null default 0 check (debt_overdue>=0),
  add column if not exists debt_overdue_principal int not null default 0 check (debt_overdue_principal>=0 and debt_overdue_principal<=debt_remaining),
  add column if not exists debt_misses int not null default 0 check (debt_misses between 0 and 2);

alter table public.player_recorded_beats
  add column if not exists release_day int,
  add column if not exists release_run int,
  add column if not exists release_popularity int,
  add column if not exists installments_paid int not null default 0 check (installments_paid between 0 and 3),
  add column if not exists daily_payouts jsonb not null default '[]';
create index if not exists recorded_beats_daily_active on public.player_recorded_beats(player_id,release_run,release_day)
  where status='streaming' and release_day is not null;

create table if not exists public.day_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  day_id int not null,
  run_id int not null,
  report jsonb not null,
  primary key(player_id,request_id),
  unique(player_id,run_id,day_id)
);
create table if not exists public.consumable_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  item_id text not null,
  primary key(player_id,request_id)
);
alter table public.day_requests enable row level security;
alter table public.consumable_requests enable row level security;
revoke all on public.day_requests,public.consumable_requests from public,anon,authenticated;
grant all on public.day_requests,public.consumable_requests to service_role;
grant select,insert,update,delete on public.players,public.battles,public.player_recorded_beats,
  public.player_cards,public.player_beats,public.player_equipment,public.player_clothing,
  public.player_outfit,public.studio_releases,public.player_pets,public.beatmaker_requests to service_role;
grant select on public.cards,public.beats,public.case_orders to service_role;

-- Settle every outstanding old 24-hour release, including the fractional-coin carry.
do $$
declare b public.player_recorded_beats;
begin
  for b in select * from public.player_recorded_beats
    where release_day is null and status in ('streaming','complete') and stream_cap is not null
      and streams_paid<stream_cap for update loop
    update public.players set streams=streams+b.stream_cap-b.streams_paid,
      coins=coins+floor(b.stream_cap/10.0)::int-floor(b.streams_paid/10.0)::int where id=b.player_id;
    update public.player_recorded_beats set streams_paid=stream_cap,status='complete' where id=b.id;
  end loop;
end;
$$;

-- Kept under the old name because snippets, Beat Lab and old clients all use it.
create or replace function public.refresh_studio_energy(p_player_id uuid) returns public.players
language plpgsql security invoker set search_path=public as $$
declare p players;
begin
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  return p;
end;
$$;

-- Admission is inside the same transaction as activity creation. Replaying a
-- request or resuming an existing activity never inserts a row and never pays again.
create or replace function public.charge_activity_energy() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.status='active' then
    update players set energy=energy-80 where id=new.player_id and energy>=80;
    if not found then raise exception 'NO_ENERGY'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists battle_energy_charge on public.battles;
create trigger battle_energy_charge before insert on public.battles
  for each row execute function public.charge_activity_energy();
drop trigger if exists concert_energy_charge on public.concert_shows;
create trigger concert_energy_charge before insert on public.concert_shows
  for each row execute function public.charge_activity_energy();

create or replace function public.buy_consumable_atomic(p_player_id uuid,p_item_id text,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare p players; old consumable_requests;
begin
  if p_request_id is null then raise exception 'INVALID_REQUEST_ID'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into old from consumable_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if old.item_id is distinct from p_item_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('player',to_jsonb(p),'energy_added',50);
  end if;
  if p_item_id is distinct from 'energy_drink' then raise exception 'ITEM_NOT_FOUND'; end if;
  if p.coins<100 then raise exception 'NOT_ENOUGH_COINS'; end if;
  update players set coins=coins-100,energy=energy+50 where id=p_player_id returning * into p;
  insert into consumable_requests values(p_player_id,p_request_id,p_item_id);
  return jsonb_build_object('player',to_jsonb(p),'energy_added',50);
end;
$$;

-- One independent draw for each of the three instalments. Inputs are fixed at release.
create or replace function public.roll_daily_streams(p_quality int,p_popularity int) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare tier int:=0; max_tier int; advance numeric; streams bigint;
begin
  max_tier:=least(6,1+floor(log(2,1+greatest(p_popularity,0)::numeric/100))::int);
  advance:=least(0.35,0.10+p_quality/400.0);
  while tier<max_tier and random()<advance loop tier:=tier+1; end loop;
  streams:=round((200+p_quality*10)*fan_income_multiplier(p_popularity)*power(2,tier))::bigint;
  return jsonb_build_object('streams',streams,'viral_tier',tier,'max_tier',max_tier);
end;
$$;

create or replace function public.pay_daily_beat(p_player_id uuid,p_beat_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare b player_recorded_beats; draw jsonb; v_streams bigint; v_coins int; payout jsonb;
begin
  perform 1 from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.release_day is null or b.installments_paid>=3 or b.status<>'streaming' then raise exception 'BEAT_NOT_STREAMING'; end if;
  if not exists(select 1 from players p where p.id=p_player_id and p.game_run=b.release_run
    and p.game_day=b.release_day+b.installments_paid) then raise exception 'DAY_CHANGED'; end if;
  draw:=roll_daily_streams(b.quality_score,b.release_popularity);
  v_streams:=(draw->>'streams')::bigint;
  v_coins:=floor((b.streams_paid+v_streams)/10.0)::int-floor(b.streams_paid/10.0)::int;
  payout:=draw||jsonb_build_object('beat_id',b.id,'name',b.name,'installment',b.installments_paid+1,'coins',v_coins);
  update player_recorded_beats set installments_paid=installments_paid+1,
    stream_cap=coalesce(stream_cap,0)+v_streams,streams_paid=streams_paid+v_streams,
    daily_payouts=daily_payouts||jsonb_build_array(payout),
    status=case when installments_paid=2 then 'complete' else 'streaming' end where id=b.id;
  update players set streams=players.streams+v_streams,coins=players.coins+v_coins where id=p_player_id;
  return payout;
end;
$$;

create or replace function public.release_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare p players; b player_recorded_beats; old beatmaker_requests; payload jsonb; payout jsonb; response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  payload:=jsonb_build_object('beat_id',p_beat_id);
  select * into old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if old.action<>'release' or old.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status<>'draft' then raise exception 'BEAT_ALREADY_PROCESSED'; end if;
  update player_recorded_beats set status='streaming',stream_cap=0,released_at=clock_timestamp(),
    release_day=p.game_day,release_run=p.game_run,release_popularity=p.popularity where id=b.id;
  payout:=pay_daily_beat(p_player_id,b.id);
  select * into b from player_recorded_beats where id=b.id;
  select * into p from players where id=p_player_id;
  response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'duration_days',3,'installment',1,
    'max_streams',payout->'streams','viral_tier',payout->'viral_tier','max_tier',payout->'max_tier',
    'streams_earned',payout->'streams','coins_earned',payout->'coins');
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'release',payload,response);
  return response;
end;
$$;

-- Reset the run, keeping the player identity, Stars orders, cooldowns and request
-- receipts. Paid pet levels are reconstructed solely from verified paid orders.
create or replace function public.reset_game_run(p_player_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare free_beat int;
begin
  perform 1 from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  delete from battles where player_id=p_player_id;
  delete from concert_requests where player_id=p_player_id;
  delete from concert_shows where player_id=p_player_id;
  delete from concert_careers where player_id=p_player_id;
  delete from player_recorded_beats where player_id=p_player_id;
  delete from studio_releases where player_id=p_player_id;
  delete from player_outfit where player_id=p_player_id;
  delete from player_clothing where player_id=p_player_id;
  delete from player_equipment where player_id=p_player_id;
  delete from player_beats where player_id=p_player_id;
  delete from player_cards where player_id=p_player_id;
  delete from player_pets where player_id=p_player_id;
  insert into player_pets(player_id,pet_id,level,friendship)
    select p_player_id,response->'drop'->>'pet_id',least(3,count(*))::int,0 from case_orders
    where player_id=p_player_id and status='paid' and response->'drop'->>'type'='pet'
      and coalesce((response->'drop'->>'refund')::int,0)=0
    group by response->'drop'->>'pet_id';
  insert into player_cards(player_id,card_id,uses_left)
    select p_player_id,id,3 from cards where id=any(array[140,101,102,104,105,141,111,112,113,115,143,121,122,124,125,131,132,133,134]);
  insert into player_beats(player_id,beat_id) select p_player_id,id from beats where price=0;
  select min(id) into free_beat from beats where price=0;
  update players set game_day=1,game_run=game_run+1,energy=100,energy_updated_at=clock_timestamp(),
    debt_remaining=1000,debt_overdue=0,debt_overdue_principal=0,debt_misses=0,
    coins=300,streams=0,hype=0,level=1,xp=0,popularity=0,
    skill_rhyme=1,skill_flow=1,skill_punch=1,skill_charisma=1,
    ai_requests_today=0,selected_beat_id=free_beat,
    active_pet_id=case when exists(select 1 from player_pets pp where pp.player_id=p_player_id and pp.pet_id=players.active_pet_id)
      then active_pet_id else null end where id=p_player_id;
end;
$$;

create or replace function public.end_game_day(p_player_id uuid,p_day_id int,p_run_id int,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare p players; old day_requests; b record; payout jsonb; releases jsonb:='[]';
  roll int; gained int; earned int:=0; streams bigint:=0; due int:=0; principal int:=0; paid int:=0;
  misses int; overdue int; remaining int; reset boolean:=false; report jsonb;
begin
  if p_request_id is null or p_day_id is null or p_run_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into old from day_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if old.day_id<>p_day_id or old.run_id<>p_run_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('player',to_jsonb(p),'report',old.report,'replayed',true);
  end if;
  if p.game_day<>p_day_id or p.game_run<>p_run_id then raise exception 'DAY_CHANGED'; end if;
  if exists(select 1 from battles where player_id=p_player_id and status='active') or
    exists(select 1 from concert_shows where player_id=p_player_id and status='active') then raise exception 'ACTIVITY_IN_PROGRESS'; end if;
  roll:=70+floor(random()*31)::int;
  gained:=greatest(0,least(100-p.energy,roll));
  update players set game_day=game_day+1,energy=energy+gained,energy_updated_at=clock_timestamp() where id=p_player_id;
  for b in select id from player_recorded_beats where player_id=p_player_id and status='streaming'
    and release_run=p_run_id and release_day+installments_paid=p_day_id+1 order by id loop
    payout:=pay_daily_beat(p_player_id,b.id);
    releases:=releases||jsonb_build_array(payout);
    earned:=earned+(payout->>'coins')::int; streams:=streams+(payout->>'streams')::bigint;
  end loop;
  select * into p from players where id=p_player_id;
  misses:=p.debt_misses; overdue:=p.debt_overdue; remaining:=p.debt_remaining;
  if p_day_id>=3 and remaining>0 then
    principal:=least(100,remaining-p.debt_overdue_principal)+p.debt_overdue_principal;
    due:=least(100,remaining-p.debt_overdue_principal)+overdue;
    if p.coins>=due then
      paid:=due; remaining:=remaining-principal; misses:=0; overdue:=0;
      update players set coins=coins-paid,debt_remaining=remaining,debt_overdue=0,debt_overdue_principal=0,debt_misses=0 where id=p_player_id;
    else
      misses:=misses+1; overdue:=ceil(due*1.5)::int;
      if misses=3 then
        reset:=true; perform reset_game_run(p_player_id);
      else
        update players set debt_overdue=overdue,debt_overdue_principal=principal,debt_misses=misses where id=p_player_id;
      end if;
    end if;
  end if;
  select * into p from players where id=p_player_id;
  report:=jsonb_build_object('day_finished',p_day_id,'next_day',p.game_day,'energy_roll',roll,'energy_gained',gained,
    'streams_earned',streams,'coins_earned',earned,'releases',releases,
    'debt_due',due,'debt_paid',paid,'debt_remaining',remaining,'overdue',overdue,'missed_payments',misses,'reset',reset);
  insert into day_requests values(p_player_id,p_request_id,p_day_id,p_run_id,report);
  return jsonb_build_object('player',to_jsonb(p),'report',report,'replayed',false);
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['refresh_studio_energy','charge_activity_energy',
      'buy_consumable_atomic','roll_daily_streams','pay_daily_beat','release_recorded_beat_atomic','reset_game_run','end_game_day']) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
notify pgrst,'reload schema';
