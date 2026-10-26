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
