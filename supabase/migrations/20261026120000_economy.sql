-- Экономика v0.2: студия (сниппеты), биты, оборудование, паки.
-- Числа и формулы: docs/api.md «Экономика» и docs/game-design.md раздел 8.
-- Каталоги битов/оборудования/паков — в backend/seed.sql (запусти его после миграции).
-- Свежие проекты получают те же таблицы из backend/schema.sql.
-- Безопасно запускать повторно.

create table if not exists public.beats (
  id serial primary key,
  name text not null,
  base_streams int not null,                    -- стримы за один релиз до множителей
  price int not null default 0                  -- 0 = бесплатный, куплен всем при регистрации
);

-- Колонки игрока для студии. Энергия восстанавливается временем:
-- сервер считает от energy_updated_at (+1 за 3 секунды, максимум 100).
alter table public.players
  add column if not exists streams bigint not null default 0,
  add column if not exists hype int not null default 0,
  add column if not exists energy int not null default 100,
  add column if not exists energy_updated_at timestamptz not null default now(),
  add column if not exists selected_beat_id int references public.beats(id);

-- Стартовые монеты нового игрока (уже созданные игроки не меняются).
alter table public.players alter column coins set default 300;

create table if not exists public.equipment (
  id serial primary key,
  name text not null,
  price int not null,
  bonus_type text not null check (bonus_type in ('income_pct', 'popularity_pct', 'charisma')),
  bonus_value int not null default 0
);

create table if not exists public.player_equipment (
  player_id uuid references public.players(id) on delete cascade,
  equipment_id int references public.equipment(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (player_id, equipment_id)
);

create table if not exists public.player_beats (
  player_id uuid references public.players(id) on delete cascade,
  beat_id int references public.beats(id) on delete cascade,
  primary key (player_id, beat_id)
);

create table if not exists public.packs (
  id serial primary key,
  name text not null,
  price int not null,
  clothing_chance numeric(3,2) not null default 0.07   -- шанс, что вместо карточки выпадет одежда
);

alter table public.beats enable row level security;
alter table public.equipment enable row level security;
alter table public.player_equipment enable row level security;
alter table public.player_beats enable row level security;
alter table public.packs enable row level security;

-- Игроки, созданные до этой миграции, получают стартовый набор:
-- 300 монет и бесплатный «Бит 1» (если он ещё не выдан).
update public.players set coins = 300 where coins = 0;

insert into public.player_beats (player_id, beat_id)
select p.id, b.id from public.players p cross join public.beats b where b.price = 0
on conflict do nothing;

-- Всем, у кого бит ещё не выбран, выбираем бесплатный.
update public.players p
set selected_beat_id = (select b.id from public.beats b where b.price = 0 order by b.id limit 1)
where selected_beat_id is null;

-- Одежда соперника в батле (только отображение, выбирается один раз на батл).
alter table public.battles add column if not exists opponent_outfit jsonb;

-- =====================================================
-- АТОМАРНЫЕ ОПЕРАЦИИ ЭКОНОМИКИ
-- Покупки и ролл пака выполняются внутри базы, чтобы монеты
-- нельзя было потратить дважды двумя параллельными запросами.
-- =====================================================

create or replace function public.purchase_item(p_player_id uuid, p_kind text, p_item_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price int;
  v_owned boolean;
begin
  if p_kind = 'equipment' then
    select price into v_price from public.equipment where id = p_item_id;
    if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_equipment
      where player_id = p_player_id and equipment_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    update public.players set coins = coins - v_price
      where id = p_player_id and coins >= v_price returning coins into v_price;
    if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    insert into public.player_equipment (player_id, equipment_id) values (p_player_id, p_item_id);
  elsif p_kind = 'clothing' then
    select price into v_price from public.clothing where id = p_item_id;
    if not found or v_price is null then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_clothing
      where player_id = p_player_id and clothing_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    update public.players set coins = coins - v_price
      where id = p_player_id and coins >= v_price returning coins into v_price;
    if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    insert into public.player_clothing (player_id, clothing_id) values (p_player_id, p_item_id);
  elsif p_kind = 'beat' then
    select price into v_price from public.beats where id = p_item_id;
    if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_beats
      where player_id = p_player_id and beat_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    if v_price > 0 then
      update public.players set coins = coins - v_price
        where id = p_player_id and coins >= v_price returning coins into v_price;
      if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    end if;
    insert into public.player_beats (player_id, beat_id) values (p_player_id, p_item_id);
    update public.players set selected_beat_id = p_item_id where id = p_player_id;
  else
    raise exception using message = 'ITEM_NOT_FOUND';
  end if;
end;
$$;

-- Ролл пака. Карточка: редкость common 70 / rare 24 / epic 6, сначала из
-- некупленных; дубликат возвращает 20 / 60 / 150 монет и чинит сгоревшую
-- карточку до 3 боёв. Одежда (7%): любая, которой ещё нет.
create or replace function public.open_pack_atomic(p_player_id uuid, p_pack_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.packs%rowtype;
  v_coins int;
  v_item public.clothing%rowtype;
  v_card public.cards%rowtype;
  v_duplicate boolean;
  v_refund int := 0;
begin
  select * into v_pack from public.packs where id = p_pack_id;
  if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;

  update public.players set coins = coins - v_pack.price
    where id = p_player_id and coins >= v_pack.price
  returning coins into v_coins;
  if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;

  if random() < v_pack.clothing_chance then
    select * into v_item from public.clothing c
    where not exists (
      select 1 from public.player_clothing pc
      where pc.player_id = p_player_id and pc.clothing_id = c.id
    )
    order by random() limit 1;
    if found then
      insert into public.player_clothing (player_id, clothing_id) values (p_player_id, v_item.id);
      return jsonb_build_object('type', 'clothing', 'item_id', v_item.id, 'duplicate', false, 'refund', 0);
    end if;
  end if;

  select * into v_card from public.cards c
  where not exists (
    select 1 from public.player_cards pc
    where pc.player_id = p_player_id and pc.card_id = c.id
  )
  order by -ln(random()) / (case c.rarity when 'common' then 70 when 'rare' then 24 else 6 end)
  limit 1;
  v_duplicate := not found;
  if not found then
    select * into v_card from public.cards c
    order by -ln(random()) / (case c.rarity when 'common' then 70 when 'rare' then 24 else 6 end)
    limit 1;
  end if;

  if v_duplicate then
    v_refund := case v_card.rarity when 'common' then 20 when 'rare' then 60 else 150 end;
    update public.players set coins = coins + v_refund where id = p_player_id;
    update public.player_cards set uses_left = 3
      where player_id = p_player_id and card_id = v_card.id;
  else
    insert into public.player_cards (player_id, card_id, uses_left) values (p_player_id, v_card.id, 3);
  end if;
  return jsonb_build_object('type', 'card', 'card_id', v_card.id, 'duplicate', v_duplicate, 'refund', v_refund);
end;
$$;

revoke all on function public.purchase_item(uuid, text, int) from public, anon, authenticated;
revoke all on function public.open_pack_atomic(uuid, int) from public, anon, authenticated;
grant execute on function public.purchase_item(uuid, text, int) to service_role;
grant execute on function public.open_pack_atomic(uuid, int) to service_role;

-- +50 монет за победу (экономика v0.2). Заменяет версию из
-- 20261026000000_card_limits.sql, отличия: v_coins_change, coins в update players,
-- coins_change в rewards. Права на функцию сохраняются при replace.
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
