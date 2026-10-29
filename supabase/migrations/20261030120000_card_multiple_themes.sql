-- Cards may belong to up to three themes. Keep `theme` for existing clients;
-- `themes` is the authoritative list used by scoring and returned to clients.
alter table public.cards
  add column if not exists themes text[] not null default '{}';

update public.cards
set themes = array[theme]
where cardinality(themes) = 0 and theme is not null;

alter table public.cards drop constraint if exists cards_themes_limit;
alter table public.cards add constraint cards_themes_limit
  check (
    cardinality(themes) <= 3
    and array_position(themes, null) is null
  );

-- Approximate relations from backend/theme_relations.md.
insert into public.theme_relations (theme_a, theme_b, strength) values
  ('деньги', 'ирония', 5),
  ('деньги', 'улица', 7),
  ('ирония', 'улица', 3)
on conflict (theme_a, theme_b) do update set strength = excluded.strength;
