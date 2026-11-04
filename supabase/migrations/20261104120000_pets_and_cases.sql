-- Pets, releases and Stars delivery are mutated only by trusted Edge Functions.
create table if not exists public.pets (
  id text primary key,
  name text not null
);
insert into public.pets(id,name) values
  ('soundity','Саундити'),('micity','Майкити'),('scalevillity','Скейлвиллити')
on conflict (id) do update set name=excluded.name;
create table if not exists public.player_pets (
  player_id uuid not null references public.players(id) on delete cascade,
  pet_id text not null references public.pets(id),
  level int not null default 1 check (level between 1 and 3),
  friendship int not null default 0 check (friendship between 0 and 60),
  primary key(player_id,pet_id)
);
alter table public.players add column if not exists active_pet_id text references public.pets(id);
create table if not exists public.studio_releases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.snippet_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  taps int not null,
  response jsonb not null,
  primary key(player_id,request_id)
);
create table if not exists public.case_catalog (
  id text primary key,
  name text not null,
  price_stars int not null,
  pet_chance double precision not null check(pet_chance between 0 and 1),
  fallback_coins int not null
);
insert into public.case_catalog values
 ('free','Ежедневный кейс',0,0.0005,25),
 ('underground','Андеграунд',29,0.01,150),
 ('gift-vault','Хранилище подарков',100,0.03,600)
on conflict(id) do update set name=excluded.name,price_stars=excluded.price_stars,
 pet_chance=excluded.pet_chance,fallback_coins=excluded.fallback_coins;
create table if not exists public.case_openings (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  case_id text not null references public.case_catalog(id),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(player_id,request_id)
);
create index if not exists case_openings_cooldown on public.case_openings(player_id,created_at desc) where case_id='free';
create table if not exists public.case_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  telegram_id bigint not null,
  request_id uuid not null,
  case_id text not null references public.case_catalog(id),
  price_stars int not null check(price_stars>0),
  status text not null default 'pending' check(status in ('pending','paid')),
  invoice_url text,
  charge_id text unique,
  response jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(player_id,request_id)
);

create or replace function public.pet_income_pct(p_player_id uuid) returns int
language sql stable security definer set search_path=public as $$
  select coalesce((select pp.level + case when pp.friendship>=60 then 2 when pp.friendship>=20 then 1 else 0 end
    from player_pets pp join players p on p.id=pp.player_id and p.active_pet_id=pp.pet_id
    where pp.player_id=p_player_id),0);
$$;
create or replace function public.pets_view(p_player_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('pets',(select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'level',coalesce(pp.level,0),'owned',pp.pet_id is not null,
    'friendship',coalesce(pp.friendship,0),
    'friendship_stage',case when pp.friendship>=60 then 3 when pp.friendship>=20 then 2 else 1 end,
    'income_pct',coalesce(pp.level,0)+case when pp.friendship>=60 then 2 when pp.friendship>=20 then 1 else 0 end
  ) order by case p.id when 'soundity' then 1 when 'micity' then 2 else 3 end)
  from pets p left join player_pets pp on pp.pet_id=p.id and pp.player_id=p_player_id),
  'active_pet_id',(select active_pet_id from players where id=p_player_id),
  'income_pct',pet_income_pct(p_player_id));
$$;
create or replace function public.equip_pet_atomic(p_player_id uuid,p_pet_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if p_pet_id is not null then
    if not exists(select 1 from pets where id=p_pet_id) then raise exception 'ITEM_NOT_FOUND'; end if;
    if not exists(select 1 from player_pets where player_id=p_player_id and pet_id=p_pet_id) then raise exception 'NOT_OWNED'; end if;
  end if;
  update players set active_pet_id=p_pet_id where id=p_player_id;
  return pets_view(p_player_id);
end;
$$;
create or replace function public.award_pet_friendship() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_pet text;
begin
  if TG_TABLE_NAME='battles' then
    if old.status<>'active' or new.status<>'finished' then return new; end if;
  end if;
  select active_pet_id into v_pet from players where id=new.player_id for update;
  update player_pets set friendship=least(60,friendship+case when TG_TABLE_NAME='battles' then 3 else 1 end)
    where player_id=new.player_id and pet_id=v_pet;
  return new;
end;
$$;
drop trigger if exists pet_release_friendship on public.studio_releases;
create trigger pet_release_friendship after insert on public.studio_releases for each row execute function public.award_pet_friendship();
drop trigger if exists pet_battle_friendship on public.battles;
create trigger pet_battle_friendship after update of status on public.battles for each row execute function public.award_pet_friendship();

create or replace function public.cases_view(p_player_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'price_stars',c.price_stars,'pet_chance',c.pet_chance,'fallback_coins',c.fallback_coins,
    'available_at',case when c.id='free' then (select max(created_at)+interval '24 hours' from case_openings where player_id=p_player_id and case_id='free') else null end
  ) order by c.price_stars) from case_catalog c),'pets',pets_view(p_player_id));
$$;
create or replace function public.case_result_view(p_player_id uuid,p_result jsonb) returns jsonb
language sql stable security definer set search_path=public as $$
  select p_result||jsonb_build_object('player',(select to_jsonb(p) from players p where id=p_player_id),'pets',pets_view(p_player_id));
$$;
-- Random values are private arguments so SQL tests can cover extremely rare drops deterministically.
create or replace function public.award_case_drop(p_player_id uuid,p_case_id text,p_roll double precision,p_pet_roll double precision) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c case_catalog; v_pet text; v_level int; v_duplicate boolean; v_refund int:=0;
begin
  perform 1 from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into c from case_catalog where id=p_case_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_roll is null or p_pet_roll is null or p_roll<0 or p_roll>=1 or p_pet_roll<0 or p_pet_roll>=1 then raise exception 'INVALID_REQUEST'; end if;
  if p_roll>=c.pet_chance then
    update players set coins=coins+c.fallback_coins where id=p_player_id;
    return jsonb_build_object('type','coins','coins',c.fallback_coins);
  end if;
  v_pet:=(array['soundity','micity','scalevillity'])[1+floor(p_pet_roll*3)::int];
  select level into v_level from player_pets where player_id=p_player_id and pet_id=v_pet;
  v_duplicate:=found;
  if not v_duplicate then
    v_level:=1;
    insert into player_pets(player_id,pet_id) values(p_player_id,v_pet);
  elsif v_level<3 then
    v_level:=v_level+1;
    update player_pets set level=v_level where player_id=p_player_id and pet_id=v_pet;
  else
    v_refund:=300;
    update players set coins=coins+v_refund where id=p_player_id;
  end if;
  return jsonb_build_object('type','pet','pet_id',v_pet,'level',v_level,'duplicate',v_duplicate,'refund',v_refund);
end;
$$;
create or replace function public.open_free_case(p_player_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_response jsonb; v_drop jsonb; v_player players;
begin
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  perform 1 from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select response into v_response from case_openings where player_id=p_player_id and request_id=p_request_id;
  if found then return case_result_view(p_player_id,v_response); end if;
  if exists(select 1 from case_openings where player_id=p_player_id and case_id='free' and created_at>now()-interval '24 hours') then raise exception 'CASE_COOLDOWN'; end if;
  v_drop:=award_case_drop(p_player_id,'free',random(),random());
  select * into v_player from players where id=p_player_id;
  v_response:=jsonb_build_object('player',to_jsonb(v_player),'drop',v_drop,'pets',pets_view(p_player_id));
  insert into case_openings(player_id,request_id,case_id,response) values(p_player_id,p_request_id,'free',v_response);
  return v_response;
end;
$$;
create or replace function public.create_case_order(p_player_id uuid,p_case_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order case_orders; v_price int; v_telegram bigint;
begin
  if p_request_id is null or p_case_id not in ('underground','gift-vault') or p_case_id is null then raise exception 'INVALID_REQUEST'; end if;
  select telegram_id into v_telegram from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_order from case_orders where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_order.case_id<>p_case_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(v_order);
  end if;
  select price_stars into v_price from case_catalog where id=p_case_id;
  insert into case_orders(player_id,telegram_id,request_id,case_id,price_stars)
    values(p_player_id,v_telegram,p_request_id,p_case_id,v_price) returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
create or replace function public.fulfill_case_order(p_order_id uuid,p_telegram_id bigint,p_currency text,p_amount int,p_charge_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order case_orders; v_drop jsonb; v_response jsonb; v_player players;
begin
  select * into v_order from case_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_telegram_id is distinct from v_order.telegram_id or p_currency is distinct from 'XTR' or p_amount is distinct from v_order.price_stars
    or p_charge_id is null or length(p_charge_id)=0 or length(p_charge_id)>512 then raise exception 'INVALID_PAYMENT'; end if;
  if v_order.status='paid' then
    if v_order.charge_id<>p_charge_id then raise exception 'INVALID_PAYMENT'; end if;
    return v_order.response;
  end if;
  v_drop:=award_case_drop(v_order.player_id,v_order.case_id,random(),random());
  select * into v_player from players where id=v_order.player_id;
  v_response:=jsonb_build_object('status','paid','player',to_jsonb(v_player),'drop',v_drop,'pets',pets_view(v_order.player_id));
  update case_orders set status='paid',charge_id=p_charge_id,response=v_response,paid_at=now() where id=p_order_id;
  return v_response;
end;
$$;

-- Hold the player lock through energy, rewards, friendship and balance writes.
create or replace function public.refresh_studio_energy(p_player_id uuid) returns public.players
language plpgsql security definer set search_path=public as $$
declare p players; v_gain int; v_now timestamptz:=clock_timestamp();
begin
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  v_gain:=greatest(0,floor(extract(epoch from (v_now-p.energy_updated_at))/3)::int);
  if p.energy>=100 or p.energy+v_gain>=100 then p.energy:=100; p.energy_updated_at:=v_now;
  elsif v_gain>0 then p.energy:=p.energy+v_gain; p.energy_updated_at:=p.energy_updated_at+v_gain*interval '3 seconds'; end if;
  update players set energy=p.energy,energy_updated_at=p.energy_updated_at where id=p_player_id returning * into p;
  return p;
end;
$$;
create or replace function public.record_snippet_atomic(p_player_id uuid,p_taps int,p_request_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b beats; v_use int; v_total int; v_income int; v_pop_pct int; v_streams int; v_coins int;
  v_pop int; v_released jsonb:='[]'; v_response jsonb; v_previous snippet_requests;
begin
  if p_taps is null or p_taps<1 or p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_previous from snippet_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_previous.taps<>p_taps then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_previous.response;
  end if;
  select * into p from refresh_studio_energy(p_player_id);
  if p.energy<=0 then raise exception 'NO_ENERGY'; end if;
  v_use:=least(p_taps,200,p.energy); v_total:=p.hype+v_use;
  select * into b from beats where id=p.selected_beat_id;
  if not found then select * into b from beats where price=0 order by id limit 1; end if;
  if b.id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select coalesce(sum(bonus_value) filter(where bonus_type='income_pct'),0),coalesce(sum(bonus_value) filter(where bonus_type='popularity_pct'),0)
    into v_income,v_pop_pct from (
      select e.bonus_type,e.bonus_value from player_equipment pe join equipment e on e.id=pe.equipment_id where pe.player_id=p_player_id
      union all select c.bonus_type,c.bonus_value from player_outfit po join clothing c on c.id=po.clothing_id where po.player_id=p_player_id
    ) bonuses;
  for i in 1..(v_total/20) loop
    v_streams:=round(b.base_streams*(1+least(p.popularity,400)/200.0)*(1+(v_income+pet_income_pct(p_player_id))/100.0));
    v_coins:=round(v_streams/10.0);
    v_pop:=least(25,greatest(1,round(v_streams/100.0*(1+v_pop_pct/100.0))));
    p.popularity:=p.popularity+v_pop; p.coins:=p.coins+v_coins; p.streams:=p.streams+v_streams;
    v_released:=v_released||jsonb_build_array(jsonb_build_object('streams',v_streams,'coins',v_coins,'popularity_change',v_pop));
    insert into studio_releases(player_id) values(p_player_id);
  end loop;
  update players set energy=p.energy-v_use,energy_updated_at=p.energy_updated_at,hype=v_total%20,
    popularity=p.popularity,coins=p.coins,streams=p.streams,selected_beat_id=b.id where id=p_player_id returning * into p;
  v_response:=jsonb_build_object('player',to_jsonb(p),'released',v_released);
  insert into snippet_requests values(p_player_id,p_request_id,p_taps,v_response);
  return v_response;
end;
$$;

do $$
declare t text; f record;
begin
  foreach t in array array['pets','player_pets','studio_releases','snippet_requests','case_catalog','case_openings','case_orders'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['pet_income_pct','pets_view','equip_pet_atomic','award_pet_friendship','cases_view','case_result_view','award_case_drop','open_free_case','create_case_order','fulfill_case_order','record_snippet_atomic','refresh_studio_energy']) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
