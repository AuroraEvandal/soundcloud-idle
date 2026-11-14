-- Author lines: preserve source texts and rarities. Re-running does not duplicate texts.
with authored(text,slot,theme,rarity,rhyme_group) as (values
  ('Я тобой пообедаю','setup','ирония','epic','едаю'),
  ('Тебе быть удобрением','development','ирония','rare','ением'),
  ('Ты здесь не за победою','boost','ирония','rare','едою'),
  ('Ты тут за моим одобрением','punch','ирония','epic','ением'),
  ('Окей, я был очень низко, а теперь up-up','setup','улица','legendary','ап'),
  ('Окей, зачем ты так близко? Отойди, ты dumb','punch','ирония','legendary','ам'),
  ('Твоя жизнь - сплошное проклятье','setup','улица','rare','ятье'),
  ('За тебя не постоят твои братья','development','улица','rare','атья'),
  ('Тони старк - мой стандарт','boost','деньги','rare','арт'),
  ('Ты болтаешь, но где же твоя бумага?','punch','деньги','epic','ага'),
  ('Я могу читать рэп тупо бесконечно','setup','улица','rare','ечно'),
  ('Я в историю вошёл, я в ней буду вечно','development','улица','rare','ечно'),
  ('Думал, можешь прочитать меня?','boost','ирония','rare','еня'),
  ('Тебе не достать меня','punch','ирония','rare','еня'),
  ('У тебя fear в глазах','boost','улица','epic','ах'),
  ('Да, я вижу твой страх','punch','улица','epic','ах')
)
insert into public.cards(text,slot,theme,themes,rarity,syllables,rhyme_group,rhyme_syllables,bonus_type,bonus_value)
select a.text,a.slot,a.theme,array[a.theme],a.rarity,
  length(regexp_replace(a.text,'[^аеёиоуыэюяАЕЁИОУЫЭЮЯ]','','g')) + case when a.text like '%up-up%' then 2 when a.text like '%dumb%' or a.text like '%fear%' then 1 else 0 end,
  a.rhyme_group,1,null,0
from authored a where not exists(select 1 from public.cards c where c.text=a.text);
