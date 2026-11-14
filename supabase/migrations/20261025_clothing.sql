-- Одежда (косметика) для уже созданной базы. Свежие проекты получают те же таблицы
-- из backend/schema.sql, а каталог вещей — из backend/seed.sql (запусти его после
-- этой миграции). Безопасно запускать повторно.
create table if not exists public.clothing (
  id serial primary key,
  slot text not null check (slot in ('hat', 'hoodie', 'pants', 'shoe', 'chain')),
  name text not null,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic')),
  price int,                                    -- null = не продаётся, только из паков
  image_url text not null,                      -- PNG-слой 512x1024 для манекена
  thumb_url text not null,                      -- иконка 96x96 для списков
  description text,
  bonus_type text check (bonus_type in ('income_pct', 'popularity_pct', 'charisma')),
  bonus_value int not null default 0
);

create table if not exists public.player_clothing (
  player_id uuid references public.players(id) on delete cascade,
  clothing_id int references public.clothing(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (player_id, clothing_id)
);

create table if not exists public.player_outfit (
  player_id uuid not null references public.players(id) on delete cascade,
  slot text not null check (slot in ('hat', 'hoodie', 'pants', 'shoe', 'chain')),
  clothing_id int references public.clothing(id) on delete set null,
  primary key (player_id, slot)
);

alter table public.clothing enable row level security;
alter table public.player_clothing enable row level security;
alter table public.player_outfit enable row level security;
