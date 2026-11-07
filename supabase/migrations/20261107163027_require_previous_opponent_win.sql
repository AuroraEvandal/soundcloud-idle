-- One server-side rule for the profile and atomic battle start.
-- Existing finished wins count; no player history is rewritten.
create index if not exists battles_player_opponent_win_idx
  on public.battles (player_id, opponent_id)
  where status = 'finished' and result = 'win';

create or replace function public.opponent_unlocks(p_player_id uuid)
returns table (opponent_id int, unlocked boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with ordered as (
    select o.id, o.location_id, lag(o.id) over (order by o.id) as previous_id
    from public.opponents o
  )
  select o.id, p.popularity >= coalesce(l.required_popularity, 0)
    and (o.previous_id is null or exists (
      select 1 from public.battles b
      where b.player_id = p_player_id and b.opponent_id = o.previous_id
        and b.status = 'finished' and b.result = 'win'
    ))
  from ordered o
  left join public.locations l on l.id = o.location_id
  join public.players p on p.id = p_player_id
  order by o.id;
$$;

revoke all on function public.opponent_unlocks(uuid) from public, anon, authenticated;
grant execute on function public.opponent_unlocks(uuid) to service_role;

create or replace function public.create_battle_atomic(
  p_player_id uuid,
  p_opponent_id int,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_existing_opponent int;
  v_active uuid;
  v_active_opponent int;
  v_popularity int;
  v_opponent public.opponents%rowtype;
  v_themes text[];
  v_hand int[];
  v_id uuid;
begin
  if p_request_id is null then
    raise exception using message = 'INVALID_REQUEST_ID';
  end if;

  select id, opponent_id into v_existing, v_existing_opponent
  from public.battles
  where player_id = p_player_id and start_request_id = p_request_id;
  if v_existing is not null then
    if v_existing_opponent <> p_opponent_id then raise exception using message = 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing;
  end if;

  select popularity into v_popularity from public.players where id = p_player_id for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  select id, opponent_id into v_active, v_active_opponent
  from public.battles where player_id = p_player_id and status = 'active'
  order by created_at desc limit 1 for update;
  if v_active is not null then
    if v_active_opponent <> p_opponent_id then raise exception using message = 'BATTLE_IN_PROGRESS'; end if;
    return v_active;
  end if;

  select * into v_opponent from public.opponents where id = p_opponent_id;
  if not found then raise exception using message = 'OPPONENT_NOT_FOUND'; end if;
  if not coalesce((select u.unlocked from public.opponent_unlocks(p_player_id) u where u.opponent_id = p_opponent_id), false) then
    raise exception using message = 'OPPONENT_LOCKED';
  end if;

  select array_agg(themes.theme) into v_themes
  from (
    select theme from (select distinct c.theme as theme from public.cards c where c.theme is not null) distinct_themes
    order by random() limit 3
  ) themes;
  if coalesce(cardinality(v_themes), 0) < 3 then
    raise exception using message = 'THEMES_NOT_CONFIGURED';
  end if;

  v_hand := public.make_battle_hand(p_player_id, null, true);
  insert into public.battles (player_id, opponent_id, themes, current_hand, start_request_id)
  values (p_player_id, p_opponent_id, v_themes, v_hand, p_request_id)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id, opponent_id into v_existing, v_existing_opponent
  from public.battles
  where player_id = p_player_id and start_request_id = p_request_id;
  if v_existing is not null then
    if v_existing_opponent <> p_opponent_id then raise exception using message = 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing;
  end if;
  raise;
end;
$$;

revoke all on function public.create_battle_atomic(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.create_battle_atomic(uuid, int, uuid) to service_role;