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
  length(text) - length(regexp_replace(lower(text), '[^аеёиоуыэюя]', '', 'g')),
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
