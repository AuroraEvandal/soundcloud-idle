-- Upgrade for an existing project. Fresh installs also need the matching columns
-- in backend/schema.sql. Safe to run more than once.
alter table public.battles
  add column if not exists start_request_id uuid,
  add column if not exists current_round int not null default 1;

alter table public.rounds
  add column if not exists request_id uuid,
  add column if not exists result_payload jsonb;

create unique index if not exists battles_start_request_id_idx
  on public.battles (player_id, start_request_id)
  where start_request_id is not null;

create unique index if not exists rounds_request_id_idx
  on public.rounds (request_id)
  where request_id is not null;

create or replace function public.make_battle_hand(p_player_id uuid)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot text;
  v_slot_ids int[];
  v_ids int[] := '{}';
begin
  foreach v_slot in array array['setup', 'development', 'boost', 'punch'] loop
    select coalesce(array_agg(picked.id), '{}') into v_slot_ids
    from (
      select c.id
      from public.player_cards pc
      join public.cards c on c.id = pc.card_id
      where pc.player_id = p_player_id and c.slot = v_slot
      order by random()
      limit 6
    ) as picked;

    if cardinality(v_slot_ids) < 4 then
      raise exception using message = 'CARD_POOL_TOO_SMALL';
    end if;
    v_ids := v_ids || v_slot_ids;
  end loop;
  return v_ids;
end;
$$;

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
  if v_popularity < coalesce((select l.required_popularity from public.locations l where l.id = v_opponent.location_id), 0) then
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

  v_hand := public.make_battle_hand(p_player_id);
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

create or replace function public.cards_for_hand(p_ids int[], p_slot text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', c.id, 'text', c.text, 'theme', c.theme, 'rarity', c.rarity,
      'syllables', c.syllables,
      'bonus', case when c.bonus_type is null then null else jsonb_build_object('type', c.bonus_type, 'value', c.bonus_value) end
    )) order by array_position(p_ids, c.id)
  ), '[]'::jsonb)
  from public.cards c
  where c.id = any(p_ids) and c.slot = p_slot;
$$;

create or replace function public.hand_json(p_ids int[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'setup', public.cards_for_hand(p_ids, 'setup'),
    'development', public.cards_for_hand(p_ids, 'development'),
    'boost', public.cards_for_hand(p_ids, 'boost'),
    'punch', public.cards_for_hand(p_ids, 'punch')
  );
$$;

create or replace function public.submit_round_atomic(
  p_player_id uuid,
  p_battle_id uuid,
  p_round_number int,
  p_request_id uuid,
  p_card_ids int[],
  p_round_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles%rowtype;
  v_player public.players%rowtype;
  v_existing public.rounds%rowtype;
  v_next_hand int[];
  v_round_winner text;
  v_player_wins int;
  v_opponent_wins int;
  v_player_total int;
  v_opponent_total int;
  v_done boolean;
  v_result text;
  v_xp_change int := 0;
  v_pop_change int := 0;
  v_floor int;
  v_level_up boolean := false;
  v_new_level int;
  v_left int;
  v_pop_before int;
  v_random_skill int;
  v_response jsonb;
  v_next jsonb;
  v_hand jsonb;
begin
  if p_request_id is null then raise exception using message = 'INVALID_REQUEST_ID'; end if;
  select * into v_battle from public.battles where id = p_battle_id and player_id = p_player_id for update;
  if not found then raise exception using message = 'BATTLE_NOT_FOUND'; end if;

  select * into v_existing from public.rounds where battle_id = p_battle_id and round_number = p_round_number;
  if found then
    if v_existing.request_id = p_request_id then
      if v_existing.card_ids <> p_card_ids then raise exception using message = 'IDEMPOTENCY_CONFLICT'; end if;
      return v_existing.result_payload;
    end if;
    raise exception using message = 'ROUND_ALREADY_SUBMITTED';
  end if;
  if v_battle.status = 'finished' then raise exception using message = 'BATTLE_FINISHED'; end if;
  if p_round_number <> v_battle.current_round then raise exception using message = 'INVALID_ROUND'; end if;
  if cardinality(p_card_ids) <> 4 or (select count(distinct chosen.card_id) from unnest(p_card_ids) as chosen(card_id)) <> 4 then
    raise exception using message = 'INVALID_CARDS';
  end if;
  if not (p_card_ids <@ v_battle.current_hand) then raise exception using message = 'INVALID_CARDS'; end if;
  if exists (
    select 1 from unnest(p_card_ids) chosen(id)
    left join public.cards c on c.id = chosen.id
    left join public.player_cards pc on pc.card_id = c.id and pc.player_id = p_player_id
    where c.id is null or pc.card_id is null
  ) then raise exception using message = 'CARD_NOT_OWNED'; end if;

  select * into v_player from public.players where id = p_player_id for update;
  if v_player.ai_requests_date <> current_date then
    update public.players set ai_requests_today = 0, ai_requests_date = current_date where id = p_player_id;
    v_player.ai_requests_today := 0;
  end if;
  if v_player.ai_requests_today >= 20 then raise exception using message = 'DAILY_LIMIT'; end if;

  v_round_winner := p_round_data->'round'->>'winner';
  if v_round_winner not in ('player', 'opponent', 'draw') then raise exception using message = 'INVALID_ROUND_RESULT'; end if;
  v_player_wins := v_battle.player_rounds_won + case when v_round_winner = 'player' then 1 else 0 end;
  v_opponent_wins := v_battle.opponent_rounds_won + case when v_round_winner = 'opponent' then 1 else 0 end;
  select coalesce(sum(player_points), 0) into v_player_total from public.rounds where battle_id = p_battle_id;
  select coalesce(sum(opponent_points), 0) into v_opponent_total from public.rounds where battle_id = p_battle_id;
  v_player_total := v_player_total + (p_round_data->'round'->'player'->>'points')::int;
  v_opponent_total := v_opponent_total + (p_round_data->'round'->'opponent'->>'points')::int;
  v_done := v_player_wins >= 2 or v_opponent_wins >= 2 or p_round_number >= 3;

  if v_done then
    if v_player_wins > v_opponent_wins then v_result := 'win';
    elsif v_player_wins < v_opponent_wins then v_result := 'lose';
    elsif v_player_total > v_opponent_total then v_result := 'win';
    else v_result := 'lose'; end if;

    if v_result = 'win' then
      v_xp_change := 25; v_pop_change := 15;
    elsif v_result = 'lose' then
      v_xp_change := -(10 + floor(random() * 6)::int);
      v_pop_change := -(5 + floor(random() * 6)::int);
    end if;
    select coalesce(max(required_popularity), 0) into v_floor
      from public.locations where required_popularity <= v_player.popularity;
    v_pop_before := v_player.popularity;
    update public.players
      set ai_requests_today = v_player.ai_requests_today + 1,
          ai_requests_date = current_date,
          xp = greatest(0, xp + v_xp_change),
          popularity = greatest(v_floor, popularity + v_pop_change)
      where id = p_player_id
      returning * into v_player;
    v_pop_change := v_player.popularity - v_pop_before;

    while v_player.xp >= round(100 * power(1.1, v_player.level - 1)) loop
      v_random_skill := floor(random() * 4)::int;
      update public.players
        set xp = xp - round(100 * power(1.1, level - 1)),
            level = level + 1,
            skill_rhyme = skill_rhyme + case when v_random_skill = 0 then 1 else 0 end,
            skill_flow = skill_flow + case when v_random_skill = 1 then 1 else 0 end,
            skill_punch = skill_punch + case when v_random_skill = 2 then 1 else 0 end,
            skill_charisma = skill_charisma + case when v_random_skill = 3 then 1 else 0 end
        where id = p_player_id returning * into v_player;
      v_level_up := true;
    end loop;
    v_new_level := v_player.level;
  else
    update public.players
      set ai_requests_today = v_player.ai_requests_today + 1,
          ai_requests_date = current_date
      where id = p_player_id returning * into v_player;
  end if;
  v_left := greatest(0, 20 - v_player.ai_requests_today);

  if not v_done then
    v_next_hand := public.make_battle_hand(p_player_id);
    v_hand := public.hand_json(v_next_hand);
    v_next := jsonb_build_object('number', p_round_number + 1, 'theme', v_battle.themes[p_round_number + 1]);
  else
    v_hand := null;
    v_next := null;
  end if;

  v_response := jsonb_build_object(
    'round', p_round_data->'round',
    'battle', jsonb_strip_nulls(jsonb_build_object(
      'status', case when v_done then 'finished' else 'active' end,
      'result', case when v_done then v_result else null end,
      'player_rounds_won', v_player_wins,
      'opponent_rounds_won', v_opponent_wins
    )),
    'next_round', v_next,
    'hand', v_hand,
    'rewards', case when v_done then jsonb_build_object(
      'xp_change', v_xp_change,
      'popularity_change', v_pop_change,
      'level_up', v_level_up,
      'new_level', v_new_level
    ) else null end,
    'ai_requests_left', v_left
  );

  insert into public.rounds (
    battle_id, round_number, theme, card_ids, lines, rhyme_score, flow_score,
    punch_score, meaning_score, judge_comment, player_points, opponent_points,
    winner, request_id, result_payload
  ) values (
    p_battle_id, p_round_number, p_round_data->'round'->>'theme', p_card_ids,
    p_round_data->'round'->'player'->'lines',
    (p_round_data->'round'->'player'->'scores'->>'rhyme')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'flow')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'punch')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'meaning')::numeric,
    p_round_data->'round'->'player'->>'comment',
    (p_round_data->'round'->'player'->>'points')::int,
    (p_round_data->'round'->'opponent'->>'points')::int,
    v_round_winner, p_request_id, v_response
  );

  update public.battles set
    player_rounds_won = v_player_wins,
    opponent_rounds_won = v_opponent_wins,
    current_round = case when v_done then current_round else current_round + 1 end,
    current_hand = case when v_done then null else v_next_hand end,
    status = case when v_done then 'finished' else 'active' end,
    result = case when v_done then v_result else null end,
    xp_reward = v_xp_change,
    popularity_reward = case when v_done then v_pop_change else 0 end,
    finished_at = case when v_done then now() else null end
  where id = p_battle_id;

  return v_response;
end;
$$;

revoke all on function public.make_battle_hand(uuid) from public, anon, authenticated;
revoke all on function public.create_battle_atomic(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.hand_json(int[]) from public, anon, authenticated;
revoke all on function public.cards_for_hand(int[], text) from public, anon, authenticated;
revoke all on function public.submit_round_atomic(uuid, uuid, int, uuid, int[], jsonb) from public, anon, authenticated;
grant execute on function public.make_battle_hand(uuid) to service_role;
grant execute on function public.create_battle_atomic(uuid, int, uuid) to service_role;
grant execute on function public.hand_json(int[]) to service_role;
grant execute on function public.cards_for_hand(int[], text) to service_role;
grant execute on function public.submit_round_atomic(uuid, uuid, int, uuid, int[], jsonb) to service_role;
