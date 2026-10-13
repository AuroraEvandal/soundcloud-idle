-- =====================================================
-- Схема базы данных: симулятор рэпера (MVP)
-- Как запустить: Supabase -> SQL Editor -> New query ->
-- вставить весь файл -> Run
-- =====================================================


-- 1. ЛОКАЦИИ (двор, клуб, фестиваль...)
create table locations (
  id serial primary key,
  name text not null,
  required_popularity int not null default 0,  -- сколько фанатов нужно, чтобы открыть
  sort_order int not null default 0
);


-- 2. СОПЕРНИКИ-БОТЫ (вымышленные персонажи)
create table opponents (
  id serial primary key,
  location_id int references locations(id),
  name text not null,
  style text,                                  -- описание стиля
  level int not null default 1,
  is_boss boolean not null default false
);


-- 3. ИГРОКИ
create table players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,          -- ID пользователя в Telegram
  username text,
  avatar text default 'default',               -- ключ аватара/одежды
  level int not null default 1,
  xp int not null default 0,
  popularity int not null default 0,           -- фанаты
  coins int not null default 0,
  skill_rhyme int not null default 1,
  skill_flow int not null default 1,
  skill_punch int not null default 1,
  skill_charisma int not null default 1,
  ai_requests_today int not null default 0,    -- счётчик для лимита ИИ-оценок
  ai_requests_date date not null default current_date,
  created_at timestamptz not null default now()
);


-- 4. КАРТОЧКИ (каталог всех строчек в игре)
create table cards (
  id serial primary key,
  text text not null,
  slot text not null check (slot in ('setup', 'development', 'boost', 'punch')),
  theme text,                                  -- деньги, улица, ирония...
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic')),
  syllables int not null,                      -- число слогов (считается заранее)
  rhyme_group text not null,                   -- окончание для рифмы, например 'апки'
  rhyme_syllables int not null default 1,      -- сколько слогов в рифме
  bonus_type text,                             -- например 'flat_points'
  bonus_value int default 0
);


-- 5. КАКИЕ КАРТОЧКИ ЕСТЬ У ИГРОКА
create table player_cards (
  player_id uuid references players(id) on delete cascade,
  card_id int references cards(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (player_id, card_id)
);


-- 6. ЗАГОТОВКИ БОТОВ (готовые строчки с заранее посчитанными оценками)
create table opponent_lines (
  id serial primary key,
  opponent_id int not null references opponents(id) on delete cascade,
  theme text,
  lines jsonb not null,                        -- массив из 4 строк
  rhyme_score numeric(3,1) not null,
  flow_score numeric(3,1) not null,
  punch_score numeric(3,1) not null,
  meaning_score numeric(3,1) not null
);


-- 7. БАТЛЫ
create table battles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  opponent_id int not null references opponents(id),
  status text not null default 'active' check (status in ('active', 'finished')),
  result text check (result in ('win', 'lose', 'draw')),
  player_rounds_won int not null default 0,
  opponent_rounds_won int not null default 0,
  xp_reward int default 0,
  popularity_reward int default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);


-- 8. РАУНДЫ (3 раунда в батле)
create table rounds (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references battles(id) on delete cascade,
  round_number int not null check (round_number between 1 and 3),
  theme text not null,
  card_ids int[] not null,                     -- выбранные игроком карточки по слотам
  lines jsonb not null,                        -- итоговые 4 строки игрока
  opponent_line_id int references opponent_lines(id),
  -- оценки игрока
  rhyme_score numeric(3,1),
  flow_score numeric(3,1),
  punch_score numeric(3,1),
  meaning_score numeric(3,1),
  judge_comment text,
  player_points int,
  opponent_points int,
  winner text check (winner in ('player', 'opponent', 'draw')),
  created_at timestamptz not null default now(),
  unique (battle_id, round_number)
);


-- =====================================================
-- БЕЗОПАСНОСТЬ
-- Включаем RLS на всех таблицах. Без политик это значит:
-- напрямую из браузера к таблицам никто не достучится.
-- Доступ только через серверные функции (Edge Functions).
-- =====================================================
alter table locations enable row level security;
alter table opponents enable row level security;
alter table players enable row level security;
alter table cards enable row level security;
alter table player_cards enable row level security;
alter table opponent_lines enable row level security;
alter table battles enable row level security;
alter table rounds enable row level security;


-- =====================================================
-- ТЕСТОВЫЕ ДАННЫЕ (из примера раунда)
-- =====================================================
insert into locations (name, required_popularity, sort_order)
values ('Двор', 0, 1);

insert into opponents (location_id, name, style, level)
values (1, 'МС Подвал', 'Дворовый, грубоватый, любит приземлённые образы', 1);

insert into cards (text, slot, theme, rarity, syllables, rhyme_group, rhyme_syllables, bonus_type, bonus_value) values
('Ты в бою как нищий — пустой кошелёк', 'setup', 'деньги', 'common', 11, 'ок', 1, null, 0),
('А я на сцене — ты просто игрок', 'development', 'деньги', 'common', 10, 'ок', 1, null, 0),
('Ты копишь на кроссы, я кручу бабки', 'boost', 'деньги', 'common', 11, 'апки', 2, null, 0),
('Твой флоу, бро, — домашние тапки', 'punch', 'ирония', 'rare', 10, 'апки', 2, 'flat_points', 3);
