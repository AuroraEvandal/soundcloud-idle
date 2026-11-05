-- Atomic, retry-safe recording: a timeout can retry the same requestId without
-- consuming energy or granting rewards twice.
create table if not exists public.snippet_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, request_id)
);

create index if not exists snippet_requests_created_at_idx
  on public.snippet_requests (created_at);

alter table public.snippet_requests enable row level security;
revoke all on public.snippet_requests from public, anon, authenticated;
grant all on public.snippet_requests to service_role;

create or replace function public.record_snippet_atomic(
  p_player_id uuid,
  p_request_id uuid,
  p_taps int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_saved jsonb;
  v_now timestamptz := clock_timestamp();
  v_energy int;
  v_energy_updated_at timestamptz;
  v_gain int;
  v_use int;
  v_beat public.beats%rowtype;
  v_income_pct int := 0;
  v_popularity_pct int := 0;
  v_hype int;
  v_releases int;
  v_popularity int;
  v_coins bigint := 0;
  v_streams bigint := 0;
  v_release jsonb;
  v_released jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  if p_request_id is null or p_taps is null or p_taps < 1 then
    raise exception using message = 'INVALID_REQUEST';
  end if;

  -- Serialize taps with purchases and other snippet calls for this player.
  select * into v_player from public.players where id = p_player_id for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  select response into v_saved from public.snippet_requests
    where player_id = p_player_id and request_id = p_request_id;
  if found then return v_saved; end if;

  v_energy := least(100, v_player.energy);
  v_energy_updated_at := v_player.energy_updated_at;
  if v_energy >= 100 then
    v_energy_updated_at := v_now;
  else
    v_gain := floor(extract(epoch from (v_now - v_energy_updated_at)) / 3)::int;
    if v_gain > 0 then
      v_energy := least(100, v_energy + v_gain);
      v_energy_updated_at := case when v_energy >= 100
        then v_now else v_energy_updated_at + make_interval(secs => v_gain * 3) end;
    end if;
  end if;
  if v_energy <= 0 then raise exception using message = 'NO_ENERGY'; end if;

  v_use := least(p_taps, 200, v_energy);
  if v_player.selected_beat_id is not null then
    select * into v_beat from public.beats where id = v_player.selected_beat_id;
  end if;
  if v_beat.id is null then
    select * into v_beat from public.beats where price = 0 order by id limit 1;
  end if;
  if v_beat.id is null then raise exception using message = 'ITEM_NOT_FOUND'; end if;

  select coalesce(sum(bonus_value), 0)::int into v_income_pct from (
    select e.bonus_value from public.player_equipment pe
      join public.equipment e on e.id = pe.equipment_id
      where pe.player_id = p_player_id and e.bonus_type = 'income_pct'
    union all
    select c.bonus_value from public.player_outfit po
      join public.clothing c on c.id = po.clothing_id
      where po.player_id = p_player_id and c.bonus_type = 'income_pct'
  ) bonuses;
  select coalesce(sum(bonus_value), 0)::int into v_popularity_pct from (
    select e.bonus_value from public.player_equipment pe
      join public.equipment e on e.id = pe.equipment_id
      where pe.player_id = p_player_id and e.bonus_type = 'popularity_pct'
    union all
    select c.bonus_value from public.player_outfit po
      join public.clothing c on c.id = po.clothing_id
      where po.player_id = p_player_id and c.bonus_type = 'popularity_pct'
  ) bonuses;

  v_hype := v_player.hype + v_use;
  v_releases := floor(v_hype / 20.0)::int;
  v_hype := mod(v_hype, 20);
  v_popularity := v_player.popularity;
  for i in 1..v_releases loop
    declare
      v_release_streams bigint;
      v_release_coins bigint;
      v_pop_change int;
    begin
      v_release_streams := round(v_beat.base_streams *
        (1 + least(v_popularity, 400)::numeric / 200) * (1 + v_income_pct::numeric / 100));
      v_release_coins := round(v_release_streams / 10.0);
      v_pop_change := least(25, greatest(1, round(v_release_streams / 100.0 *
        (1 + v_popularity_pct::numeric / 100))::int));
      v_popularity := v_popularity + v_pop_change;
      v_streams := v_streams + v_release_streams;
      v_coins := v_coins + v_release_coins;
      v_release := jsonb_build_object('streams', v_release_streams, 'coins', v_release_coins,
        'popularity_change', v_pop_change);
      v_released := v_released || jsonb_build_array(v_release);
    end;
  end loop;

  update public.players set
    energy = v_energy - v_use,
    energy_updated_at = v_energy_updated_at,
    hype = v_hype,
    selected_beat_id = v_beat.id,
    popularity = v_popularity,
    coins = coins + v_coins,
    streams = streams + v_streams
  where id = p_player_id returning * into v_player;

  v_response := jsonb_build_object(
    'player', to_jsonb(v_player),
    'bonuses', jsonb_build_object('income_pct', v_income_pct, 'popularity_pct', v_popularity_pct),
    'released', v_released
  );
  insert into public.snippet_requests (player_id, request_id, response)
    values (p_player_id, p_request_id, v_response);

  delete from public.snippet_requests
    where player_id = p_player_id and created_at < v_now - interval '30 days';
  return v_response;
end;
$$;

revoke all on function public.record_snippet_atomic(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.record_snippet_atomic(uuid, uuid, int) to service_role;
