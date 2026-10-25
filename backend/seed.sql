-- Starter catalog used by the frontend mock. Safe to run repeatedly.
with starter(id, text, slot, theme, rarity, bonus_value) as (values
  (101, 'Я выхожу на бит, и район затих', 'setup', 'улица', 'common', 0),
  (102, 'Ты зовёшь это рэпом? Смешно, брат', 'setup', 'ирония', 'common', 0),
  (103, 'Ты копил на микрофон — я его купил', 'setup', 'деньги', 'rare', 2),
  (104, 'Мой двор тебя помнит как фоновый шум', 'setup', 'улица', 'common', 0),
  (105, 'Твой стиль — как реклама перед видео', 'setup', 'ирония', 'common', 0),
  (106, 'Ты пришёл за славой, а я уже тут', 'setup', 'улица', 'rare', 2),
  (107, 'Твой кошелёк тоньше, чем твой куплет', 'setup', 'деньги', 'epic', 4),
  (111, 'Каждый мой куплет — как удар по басам', 'development', 'улица', 'common', 0),
  (112, 'Ты читаешь с листа, а я с головы', 'development', 'ирония', 'common', 0),
  (113, 'У меня в кармане мелочь и мечта', 'development', 'деньги', 'common', 0),
  (114, 'Ты на разогреве, я уже в огне', 'development', 'улица', 'rare', 2),
  (115, 'Твои рифмы старше моих кроссовок', 'development', 'ирония', 'common', 0),
  (116, 'Я копил на бит, пока ты спал', 'development', 'деньги', 'rare', 2),
  (117, 'Твой микрофон звучит как чайник', 'development', 'ирония', 'epic', 4),
  (121, 'Район мне подпевает — я здесь свой', 'boost', 'улица', 'common', 0),
  (122, 'Твой флоу тормозит, как автобус в снег', 'boost', 'ирония', 'common', 0),
  (123, 'Мне платят за строчки, тебе — за «лайк»', 'boost', 'деньги', 'rare', 2),
  (124, 'Тут каждый знает, кто держит район', 'boost', 'улица', 'common', 0),
  (125, 'Ты хайпуешь, а я просто пишу', 'boost', 'ирония', 'common', 0),
  (126, 'Мой гонорар длиннее твоего трека', 'boost', 'деньги', 'epic', 4),
  (127, 'С моим куплетом ты как на ринге', 'boost', 'улица', 'rare', 2),
  (131, 'Ты рэпер на пенсии — раньше начала', 'punch', 'ирония', 'common', 0),
  (132, 'Мой кошелёк толще, чем твой словарь', 'punch', 'деньги', 'common', 0),
  (133, 'Тебя не слышно даже в наушниках', 'punch', 'ирония', 'common', 0),
  (134, 'Мой двор — твой потолок', 'punch', 'улица', 'common', 0),
  (135, 'С тобой рифмуется только «провал»', 'punch', 'ирония', 'rare', 3),
  (136, 'Твой долг растёт быстрее просмотров', 'punch', 'деньги', 'rare', 3),
  (137, 'Ты тут проездом, а я прописан', 'punch', 'улица', 'epic', 5),
  (140, 'Ты в бою как нищий — пустой кошелёк', 'setup', 'деньги', 'common', 0),
  (141, 'А я на сцене — ты просто игрок', 'development', 'деньги', 'common', 0),
  (142, 'Твой флоу, бро, — домашние тапки', 'punch', 'ирония', 'rare', 3),
  (143, 'Ты копишь на кроссы, я кручу бабки', 'boost', 'деньги', 'common', 0)
)
insert into public.cards (id, text, slot, theme, rarity, syllables, rhyme_group, rhyme_syllables, bonus_type, bonus_value)
select id, text, slot, theme, rarity,
  length(regexp_replace(text, '[^аеёиоуыэюяАЕЁИОУЫЭЮЯ]', '', 'g')),
  right(regexp_replace(lower(text), '[^а-яё]', '', 'g'), 2), 1,
  case when bonus_value > 0 then 'flat_points' else null end, bonus_value
from starter
on conflict (id) do update set
  text = excluded.text,
  slot = excluded.slot,
  theme = excluded.theme,
  rarity = excluded.rarity,
  syllables = excluded.syllables,
  rhyme_group = excluded.rhyme_group,
  rhyme_syllables = excluded.rhyme_syllables,
  bonus_type = excluded.bonus_type,
  bonus_value = excluded.bonus_value;

select setval(pg_get_serial_sequence('public.cards', 'id'), greatest((select max(id) from public.cards), 1), true);

-- Каталог одежды (косметика). Совпадает с мок-каталогом фронта (src/mockCatalog.js):
-- те же id и предметы, чтобы мок и сервер выдавали одинаковую вещь по id.
-- image_url/thumb_url пока пути к PNG во фронтенде (public/clothes); когда картинки
-- переедут в Supabase Storage, здесь появятся полные ссылки.
with starter(id, slot, name, rarity, price, file, description, bonus_type, bonus_value) as (values
  (1, 'hat', 'Кепка «Бутта»', 'common', 300, 'cap1', 'Белая кепка с готическим логотипом.', 'income_pct', 3),
  (2, 'hoodie', 'Свитшот «ВРАГ»', 'common', 450, 'hoodie1', 'Чёрный свитшот с красной надписью.', 'popularity_pct', 7),
  (3, 'hoodie', 'Худи-маска', 'rare', 1500, 'hoodie3', 'Чёрное худи на молнии с глухим капюшоном.', 'income_pct', 5),
  (4, 'hoodie', 'Серое пальто', 'rare', 1800, 'coat1', 'Длинное двубортное пальто.', 'popularity_pct', 7),
  (5, 'pants', 'Джинсы с черепами', 'common', 500, 'jeans1', 'Голубые джинсы с принтом из черепов.', 'income_pct', 3),
  (6, 'pants', 'Чёрные клёши', 'rare', 1400, 'jeans2', 'Расклешённые штаны с блеском потёртой кожи.', 'popularity_pct', 7),
  (7, 'shoe', 'Красные кроссовки', 'common', 600, 'sneakers1', 'Массивные красные кроссовки.', 'popularity_pct', 7),
  (8, 'shoe', 'Тяжёлые ботинки', 'rare', 1600, 'boots1', 'Чёрные ботинки с пряжками и заклёпками.', 'income_pct', 5),
  (9, 'chain', 'Клетчатый шарф', 'epic', null, 'scarf1', 'Шарф с бахромой. Выпадает только из паков.', 'income_pct', 8)
)
insert into public.clothing (id, slot, name, rarity, price, image_url, thumb_url, description, bonus_type, bonus_value)
select id, slot, name, rarity, price,
  '/clothes/' || file || '.png',
  '/clothes/' || file || '_thumb.png',
  description, bonus_type, bonus_value
from starter
on conflict (id) do update set
  slot = excluded.slot,
  name = excluded.name,
  rarity = excluded.rarity,
  price = excluded.price,
  image_url = excluded.image_url,
  thumb_url = excluded.thumb_url,
  description = excluded.description,
  bonus_type = excluded.bonus_type,
  bonus_value = excluded.bonus_value;

select setval(pg_get_serial_sequence('public.clothing', 'id'), greatest((select max(id) from public.clothing), 1), true);

-- =====================================================
-- СВЯЗИ ТЕМ (theme_relations)
-- Автор игры заполняет сам: насколько две темы близки по смыслу, 0..10.
-- Пара пишется один раз, тема_а по алфавиту раньше тема_б (иначе БД отклонит).
-- Пока пары нет в таблице, оценка «смысл» считает её нейтральной (5).
-- Пример (раскомментируй и поменяй числа на свои):
--
-- insert into public.theme_relations (theme_a, theme_b, strength) values
--   ('деньги', 'ирония', 6),
--   ('деньги', 'улица', 8),
--   ('ирония', 'улица', 7)
-- on conflict (theme_a, theme_b) do update set strength = excluded.strength;
-- =====================================================
