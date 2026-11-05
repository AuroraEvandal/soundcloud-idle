-- Three server-owned hits. Completed older attempts retain their result.
alter table public.battle_mini_games add column if not exists timing_hits int not null default 0
  check (timing_hits between 0 and 3);
update public.battle_mini_games set timing_hits=3
  where kind='timing' and penalty_points=0 and timing_hits=0;

create or replace function public.timing_position(elapsed numeric, hits int, path jsonb)
returns numeric language plpgsql immutable set search_path=public as $$
declare
  f numeric := greatest(0,least(1,elapsed / case hits when 0 then 1200 when 1 then 1000 else 2100 end));
  i int;
begin
  if hits=0 then return f; end if;
  if hits=1 then return 1-f; end if;
  i := least(6,floor(f*7)::int);
  return (path->>i)::numeric + ((path->>(i+1))::numeric-(path->>i)::numeric)*(f*7-i);
end;
$$;
revoke all on function public.timing_position(numeric,int,jsonb) from public,anon,authenticated;
grant execute on function public.timing_position(numeric,int,jsonb) to service_role;

create or replace function public.mini_game_view(g public.battle_mini_games)
returns jsonb language sql volatile set search_path = public as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'round_number', g.round_number,
    'duration_ms', case g.kind when 'timing' then case g.timing_hits when 0 then 1200 when 1 then 1000 else 2100 end when 'slang' then 2000 else 3200 end,
    'started_at', extract(epoch from g.started_at) * 1000,
    'server_now', extract(epoch from clock_timestamp()) * 1000,
    'prompt', case when g.started_at is not null then g.question->'prompt' else null end,
    'options', case when g.started_at is not null then coalesce(g.question->'options', '[]'::jsonb) else '[]'::jsonb end,
    'timing_hits', g.timing_hits,
    'timing_path', case when g.kind='timing' then g.question->'timing_path' else null end,
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
  if g.kind='timing' and not (g.question ? 'timing_path') then
    update public.battle_mini_games set question=question || jsonb_build_object('timing_path',(
      select jsonb_agg(case when i%2=0 then .05+random()*.2 else .75+random()*.2 end order by i)
      from generate_series(0,7) i)) where id=g.id returning * into g;
  end if;
  if p_action_id='start' and g.started_at is null then
    update public.battle_mini_games set started_at=clock_timestamp()+interval '800 milliseconds'
      where id=g.id returning * into g;
  end if;
  duration := case g.kind when 'timing' then case g.timing_hits when 0 then 1200 when 1 then 1000 else 2100 end when 'slang' then 2000 else 3200 end;
  if g.penalty_points is null and clock_timestamp() > g.started_at + (duration+case when g.kind='timing' then 80 else 250 end)*interval '1 millisecond' then
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
  stage int;
  position numeric;
  earlier numeric;
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
  if g.kind='timing' then
    if p_action_id is null or p_action_id !~ '^(tap|timeout)-[123]$' then
      raise exception using message='INVALID_MINI_GAME_ACTION';
    end if;
    stage := right(p_action_id,1)::int;
    if stage <= g.timing_hits then return public.mini_game_view(g); end if;
    if stage <> g.timing_hits+1 then raise exception using message='INVALID_MINI_GAME_ACTION'; end if;
    elapsed := extract(epoch from (clock_timestamp()-g.started_at))*1000;
    position := public.timing_position(elapsed,g.timing_hits,g.question->'timing_path');
    earlier := public.timing_position(greatest(0,elapsed-80),g.timing_hits,g.question->'timing_path');
    passed := p_action_id='tap-'||stage and elapsed >= 0
      and elapsed <= (case g.timing_hits when 0 then 1200 when 1 then 1000 else 2100 end)+80
      and least(position,earlier)<=.6 and greatest(position,earlier)>=.4;
    if passed then
      update public.battle_mini_games set timing_hits=timing_hits+1,
        started_at=case when stage<3 then clock_timestamp()+interval '800 milliseconds' else started_at end,
        penalty_points=case when stage=3 then 0 else null end,
        completed_at=case when stage=3 then clock_timestamp() else null end
        where id=g.id returning * into g;
    else
      update public.battle_mini_games set penalty_points=15,completed_at=clock_timestamp()
        where id=g.id returning * into g;
    end if;
    return public.mini_game_view(g);
  end if;
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
