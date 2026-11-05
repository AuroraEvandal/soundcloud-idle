create table if not exists public.player_recorded_beats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  genre text not null check (genre in ('trap','drill','phonk')),
  bpm int not null check (bpm between 60 and 180),
  musical_key int not null check (musical_key between 0 and 11),
  scale text not null check (scale in ('major','minor')),
  pattern jsonb not null,
  quality_score int not null check (quality_score between 0 and 100),
  score_breakdown jsonb not null,
  status text not null default 'draft' check (status in ('draft','sold','streaming','complete')),
  sale_coins int,
  stream_cap bigint,
  streams_paid bigint not null default 0,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (streams_paid >= 0 and (stream_cap is null or streams_paid <= stream_cap))
);
create index if not exists player_recorded_beats_owner_idx on public.player_recorded_beats(player_id,created_at desc);

create table if not exists public.beatmaker_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('record','sell','release','collect')),
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id,request_id)
);

alter table public.player_recorded_beats enable row level security;
alter table public.beatmaker_requests enable row level security;
revoke all on public.player_recorded_beats,public.beatmaker_requests from public,anon,authenticated;
grant all on public.player_recorded_beats,public.beatmaker_requests to service_role;

create or replace function public.record_beat_atomic(
  p_player_id uuid,p_request_id uuid,p_genre text,p_bpm int,p_key int,p_scale text,
  p_pattern jsonb,p_quality_score int,p_score_breakdown jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; v_payload jsonb; v_old beatmaker_requests; v_beat player_recorded_beats; v_response jsonb;
begin
  if p_request_id is null or p_genre not in ('trap','drill','phonk') or p_bpm not between 60 and 180 or
     p_key not between 0 and 11 or p_scale not in ('major','minor') or p_quality_score not between 0 and 100 then
    raise exception 'INVALID_BEAT';
  end if;
  v_payload:=jsonb_build_object('genre',p_genre,'bpm',p_bpm,'key',p_key,'scale',p_scale,'pattern',p_pattern);
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_old.action<>'record' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into p from refresh_studio_energy(p_player_id);
  if p.energy<20 then raise exception 'NO_ENERGY'; end if;
  update players set energy=p.energy-20,energy_updated_at=p.energy_updated_at where id=p_player_id returning * into p;
  insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown)
    values(p_player_id,p_genre,p_bpm,p_key,p_scale,p_pattern,p_quality_score,p_score_breakdown) returning * into v_beat;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(v_beat),'energy_cost',20);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'record',v_payload,v_response);
  return v_response;
end;
$$;

create or replace function public.sell_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b player_recorded_beats; v_payload jsonb; v_old beatmaker_requests; v_coins int; v_response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  v_payload:=jsonb_build_object('beat_id',p_beat_id);
  if found then
    if v_old.action<>'sell' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status<>'draft' then raise exception 'BEAT_ALREADY_PROCESSED'; end if;
  v_coins:=10+round(b.quality_score*0.2)::int+least(p.popularity,400)/40;
  update player_recorded_beats set status='sold',sale_coins=v_coins where id=b.id returning * into b;
  update players set coins=coins+v_coins where id=p_player_id returning * into p;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'coins_earned',v_coins);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'sell',v_payload,v_response);
  return v_response;
end;
$$;

create or replace function public.release_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b player_recorded_beats; v_payload jsonb; v_old beatmaker_requests; v_tier int:=0; v_max_tier int; v_advance numeric; v_cap bigint; v_response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  v_payload:=jsonb_build_object('beat_id',p_beat_id);
  if found then
    if v_old.action<>'release' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status<>'draft' then raise exception 'BEAT_ALREADY_PROCESSED'; end if;
  -- Popularity unlocks higher payout tiers. Each extra tier requires another successful roll,
  -- so the odds of the maximum tier fall exponentially while its stream cap doubles.
  v_max_tier:=least(6,1+floor(log(2,1+greatest(p.popularity,0)::numeric/100))::int);
  v_advance:=least(0.35,0.10+b.quality_score/400.0);
  while v_tier<v_max_tier and random()<v_advance loop v_tier:=v_tier+1; end loop;
  v_cap:=round((50+b.quality_score*2)*(1+least(p.popularity,400)/400.0)*power(2,v_tier))::bigint;
  update player_recorded_beats set status='streaming',stream_cap=v_cap,released_at=clock_timestamp() where id=b.id returning * into b;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'viral_tier',v_tier,'max_tier',v_max_tier,
    'max_streams',v_cap,'duration_hours',24);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'release',v_payload,v_response);
  return v_response;
end;
$$;

create or replace function public.collect_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b player_recorded_beats; v_payload jsonb; v_old beatmaker_requests; v_elapsed numeric; v_available bigint; v_delta bigint; v_coins int; v_response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  v_payload:=jsonb_build_object('beat_id',p_beat_id);
  if found then
    if v_old.action<>'collect' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status not in ('streaming','complete') or b.stream_cap is null then raise exception 'BEAT_NOT_STREAMING'; end if;
  v_elapsed:=greatest(0,extract(epoch from (clock_timestamp()-b.released_at)));
  v_available:=least(b.stream_cap,floor(b.stream_cap*least(1,v_elapsed/86400.0))::bigint);
  v_delta:=greatest(0,v_available-b.streams_paid);
  v_coins:=floor((b.streams_paid+v_delta)/10.0)::int-floor(b.streams_paid/10.0)::int;
  update player_recorded_beats set streams_paid=streams_paid+v_delta,
    status=case when v_available>=stream_cap then 'complete' else status end where id=b.id returning * into b;
  update players set streams=streams+v_delta,coins=coins+v_coins where id=p_player_id returning * into p;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'streams_earned',v_delta,'coins_earned',v_coins,
    'streams_remaining',greatest(0,b.stream_cap-b.streams_paid));
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'collect',v_payload,v_response);
  return v_response;
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['record_beat_atomic','sell_recorded_beat_atomic','release_recorded_beat_atomic','collect_recorded_beat_atomic']) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
