-- Stable opponent IDs also select the frontend names and artwork.
-- Each location tier keeps the same fan threshold as the existing demo.
insert into public.locations (name, required_popularity, sort_order)
select name, required, sort_order
from (values
  ('Двор', 0, 1), ('Двор', 30, 2), ('Клуб', 100, 3),
  ('Клуб', 200, 4), ('Фестиваль', 400, 5)
) as starter(name, required, sort_order)
where not exists (
  select 1 from public.locations l
  where l.name = starter.name and l.required_popularity = starter.required
);

insert into public.opponents (id, location_id, name, style, level, is_boss)
select id,
  (select min(l.id) from public.locations l
   where l.name = starter.location and l.required_popularity = starter.required),
  name, style, level, is_boss
from (values
  (1, 'МС Подвал', 'Дворовый, грубоватый', 1, 'Двор', 0, false),
  (2, 'Лёха Бит', 'Ритмичный, дерзкий', 2, 'Двор', 30, false),
  (3, 'Тихий Рейв', 'Мрачный, заумный', 3, 'Клуб', 100, false),
  (4, 'DJ Кассета', 'Старая школа, ироничный', 4, 'Клуб', 200, false),
  (5, 'Босс Фестиваля', 'Уверенный хедлайнер', 5, 'Фестиваль', 400, true)
) as starter(id, name, style, level, location, required, is_boss)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.opponents', 'id'),
  greatest((select max(id) from public.opponents), 1), true);
