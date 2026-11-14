-- Apply after the economy/card migrations. One durable attempt per next round.
create table if not exists public.battle_mini_games (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  round_number int not null check (round_number in (2, 3)),
  kind text not null check (kind in ('timing', 'slang', 'wave')),
  question jsonb not null,
  started_at timestamptz,
  penalty_points int check (penalty_points in (0, 15, 20)),
  completed_at timestamptz,
  unique (battle_id, round_number)
);
alter table public.battle_mini_games enable row level security;
revoke all on public.battle_mini_games from public, anon, authenticated;
grant all on public.battle_mini_games to service_role;

create or replace function public.mini_game_view(g public.battle_mini_games)
returns jsonb language sql volatile set search_path = public as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'round_number', g.round_number,
    'duration_ms', case g.kind when 'timing' then 2400 when 'slang' then 2000 else 3200 end,
    'started_at', extract(epoch from g.started_at) * 1000,
    'server_now', extract(epoch from clock_timestamp()) * 1000,
    'prompt', case when g.started_at is not null then g.question->'prompt' else null end,
    'options', case when g.started_at is not null then coalesce(g.question->'options', '[]'::jsonb) else '[]'::jsonb end,
    'penalty_points', g.penalty_points
  );
$$;

create or replace function public.mini_game_start(
  p_player_id uuid, p_battle_id uuid, p_round_number int, p_action_id text, p_game jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.battles%rowtype;
  g public.battle_mini_games%rowtype;
  duration int;
begin
  select * into b from public.battles where id=p_battle_id and player_id=p_player_id for update;
  if not found then raise exception using message='BATTLE_NOT_FOUND'; end if;
  if b.status <> 'active' then raise exception using message='BATTLE_FINISHED'; end if;
  if p_round_number is null or p_round_number not in (2,3) or b.current_round <> p_round_number then
    raise exception using message='INVALID_ROUND';
  end if;
  if p_action_id is null or p_action_id not in ('prepare','start') then
    raise exception using message='INVALID_MINI_GAME_ACTION';
  end if;
  select * into g from public.battle_mini_games where battle_id=b.id and round_number=p_round_number;
  if not found then
    if p_game->>'kind' is null or p_game->>'kind' not in ('timing','slang','wave') then
      raise exception using message='INVALID_MINI_GAME_ACTION';
    end if;
    insert into public.battle_mini_games(battle_id,round_number,kind,question)
      values (b.id,p_round_number,p_game->>'kind',p_game) returning * into g;
  end if;
  if p_action_id='start' and g.started_at is null then
    update public.battle_mini_games set started_at=clock_timestamp()+interval '800 milliseconds'
      where id=g.id returning * into g;
  end if;
  duration := case g.kind when 'timing' then 2400 when 'slang' then 2000 else 3200 end;
  if g.penalty_points is null and clock_timestamp() > g.started_at + (duration+250)*interval '1 millisecond' then
    update public.battle_mini_games set penalty_points=case g.kind when 'slang' then 20 else 15 end,
      completed_at=clock_timestamp() where id=g.id returning * into g;
  end if;
  return public.mini_game_view(g);
end;
$$;

create or replace function public.mini_game_finish(
  p_player_id uuid, p_battle_id uuid, p_game_id uuid, p_action_id text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.battles%rowtype;
  g public.battle_mini_games%rowtype;
  elapsed numeric;
  passed boolean := false;
begin
  select * into b from public.battles where id=p_battle_id and player_id=p_player_id for update;
  if not found then raise exception using message='BATTLE_NOT_FOUND'; end if;
  select * into g from public.battle_mini_games where id=p_game_id and battle_id=b.id;
  if not found then raise exception using message='MINI_GAME_REQUIRED'; end if;
  -- A retry remains readable even if the next round has already been submitted.
  if g.penalty_points is not null then return public.mini_game_view(g); end if;
  if b.status <> 'active' then raise exception using message='BATTLE_FINISHED'; end if;
  if b.current_round <> g.round_number then raise exception using message='INVALID_ROUND'; end if;
  if g.started_at is null then raise exception using message='MINI_GAME_NOT_STARTED'; end if;
  if p_action_id is null or not (
    p_action_id='timeout' or
    (g.kind in ('timing','wave') and p_action_id='tap') or
    (g.kind='slang' and exists(select 1 from jsonb_array_elements(g.question->'options') o where o->>'id'=p_action_id))
  ) then raise exception using message='INVALID_MINI_GAME_ACTION'; end if;
  elapsed := extract(epoch from (clock_timestamp()-g.started_at))*1000;
  -- 250ms right-edge network tolerance; the browser never supplies its own clock.
  if p_action_id <> 'timeout' and elapsed >= 0 then
    passed := case g.kind
      when 'timing' then elapsed between 840 and 1810
      when 'wave' then elapsed between 560 and 1290 or elapsed between 2160 and 2890
      else elapsed <= 2250 and p_action_id=g.question->>'answer_id' end;
  end if;
  update public.battle_mini_games set
    penalty_points=case when passed then 0 when g.kind='slang' then 20 else 15 end,
    completed_at=clock_timestamp() where id=g.id returning * into g;
  return public.mini_game_view(g);
end;
$$;

revoke all on function public.mini_game_view(public.battle_mini_games) from public, anon, authenticated;
revoke all on function public.mini_game_start(uuid,uuid,int,text,jsonb) from public, anon, authenticated;
revoke all on function public.mini_game_finish(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.mini_game_view(public.battle_mini_games) to service_role;
grant execute on function public.mini_game_start(uuid,uuid,int,text,jsonb) to service_role;
grant execute on function public.mini_game_finish(uuid,uuid,uuid,text) to service_role;

-- Preserve economy/reward logic; apply the penalty inside its existing transaction.
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
  v_coins_change int := 0;
  v_floor int;
  v_level_up boolean := false;
  v_new_level int;
  v_pop_before int;
  v_random_skill int;
  v_response jsonb;
  v_next jsonb;
  v_hand jsonb;
  v_mini public.battle_mini_games%rowtype;
  v_penalty int := 0;
  v_base_points int;
  v_final_points int;
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
  if exists (
    select 1 from public.player_cards pc
    where pc.player_id = p_player_id and pc.card_id = any(p_card_ids) and pc.uses_left <= 0
  ) then raise exception using message = 'CARD_BURNED'; end if;

  -- Resolve the saved penalty under the same battle lock, before cards/rewards.
  if p_round_number > 1 then
    select * into v_mini from public.battle_mini_games
      where battle_id=p_battle_id and round_number=p_round_number;
    if not found or v_mini.penalty_points is null then
      raise exception using message='MINI_GAME_REQUIRED';
    end if;
    v_penalty := v_mini.penalty_points;
  end if;
  v_base_points := (p_round_data->'round'->'player'->>'points')::int;
  v_final_points := greatest(0, v_base_points-v_penalty);
  p_round_data := jsonb_set(p_round_data, '{round,player}', (p_round_data->'round'->'player') ||
    jsonb_build_object('base_points',v_base_points,'penalty_points',v_penalty,'points',v_final_points));
  p_round_data := jsonb_set(p_round_data, '{round,winner}', to_jsonb(case
    when v_final_points > (p_round_data->'round'->'opponent'->>'points')::int then 'player'
    when v_final_points < (p_round_data->'round'->'opponent'->>'points')::int then 'opponent'
    else 'draw' end));
  p_round_data := jsonb_set(p_round_data, '{round,mini_game}', case when p_round_number=1 then 'null'::jsonb else
    jsonb_build_object('kind',v_mini.kind,'penalty_points',v_penalty,'message',case
      when v_penalty=0 then 'Концентрация сохранена'
      when v_mini.kind='slang' then 'Забыл текст на**й!'
      when v_mini.kind='timing' then 'Мимо! Штрафные баллы!'
      else 'Микрофон фонит! Сбился с волны.' end) end);

  select * into v_player from public.players where id = p_player_id for update;

  update public.player_cards pc
  set uses_left = pc.uses_left - 1
  where pc.player_id = p_player_id
    and pc.card_id = any(p_card_ids)
    and not exists (
      select 1
      from public.rounds r
      cross join unnest(r.card_ids) as prev(card_id)
      where r.battle_id = p_battle_id and prev.card_id = pc.card_id
    );

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
      v_xp_change := 25; v_pop_change := 15; v_coins_change := 50;
    elsif v_result = 'lose' then
      v_xp_change := -(10 + floor(random() * 6)::int);
      v_pop_change := -(5 + floor(random() * 6)::int);
    end if;
    select coalesce(max(required_popularity), 0) into v_floor
    from public.locations where required_popularity <= v_player.popularity;
    v_pop_before := v_player.popularity;
    update public.players
    set xp = greatest(0, xp + v_xp_change),
        popularity = greatest(v_floor, popularity + v_pop_change),
        coins = coins + v_coins_change
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
  end if;

  if not v_done then
    v_next_hand := public.make_battle_hand(p_player_id, p_battle_id, false);
    v_hand := public.hand_json(p_player_id, v_next_hand);
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
      'coins_change', v_coins_change,
      'level_up', v_level_up,
      'new_level', v_new_level
    ) else null end
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
