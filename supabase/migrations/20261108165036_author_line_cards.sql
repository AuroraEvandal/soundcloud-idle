alter table public.cards drop constraint if exists cards_rarity_check;
alter table public.cards add constraint cards_rarity_check check (rarity in ('common','rare','epic','legendary'));

create or replace function public.open_pack_atomic(p_player_id uuid,p_pack_id int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_pack public.packs; v_balance public.game_balance; v_item public.clothing;
  v_card public.cards; v_rarity text; v_duplicate boolean; v_refund int:=0;
begin
  select * into v_pack from public.packs where id=p_pack_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  update public.players set coins=coins-v_pack.price where id=p_player_id and coins>=v_pack.price;
  if not found then raise exception 'NOT_ENOUGH_COINS'; end if;
  if v_pack.card_slot is null and random()<v_pack.clothing_chance then
    select * into v_item from public.clothing c where not exists(
      select 1 from public.player_clothing pc where pc.player_id=p_player_id and pc.clothing_id=c.id
    ) order by random() limit 1;
    if found then
      insert into public.player_clothing(player_id,clothing_id) values(p_player_id,v_item.id);
      return jsonb_build_object('type','clothing','item_id',v_item.id,'duplicate',false,'refund',0);
    end if;
  end if;
  select * into v_balance from public.game_balance where id=true;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  -- Weighted categories, followed by a card within the winning rarity.
  select category into v_rarity from (values
    ('common',coalesce(v_pack.common_weight,v_balance.common_weight)),
    ('rare',coalesce(v_pack.rare_weight,v_balance.rare_weight)),
    ('epic',coalesce(v_pack.epic_weight,v_balance.epic_weight)),
    ('legendary',1)
  ) w(category,weight) where weight>0 and exists(select 1 from public.cards c where c.rarity=category
      and (v_pack.card_slot is null or c.slot=v_pack.card_slot))
    order by -ln(greatest(random(),1e-15))/weight limit 1;
  if v_rarity is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_card from public.cards c where c.rarity=v_rarity
    and (v_pack.card_slot is null or c.slot=v_pack.card_slot)
    order by exists(select 1 from public.player_cards pc where pc.player_id=p_player_id and pc.card_id=c.id),random() limit 1;
  v_duplicate:=exists(select 1 from public.player_cards where player_id=p_player_id and card_id=v_card.id);
  if v_duplicate then
    v_refund:=fan_income_coins(case v_card.rarity when 'common' then 20 when 'rare' then 60 when 'legendary' then 300 else 150 end,
      (select popularity from public.players where id=p_player_id));
    update public.players set coins=coins+v_refund where id=p_player_id;
    update public.player_cards set uses_left=3 where player_id=p_player_id and card_id=v_card.id;
  else
    insert into public.player_cards(player_id,card_id,uses_left) values(p_player_id,v_card.id,3);
  end if;
  return jsonb_build_object('type','card','card_id',v_card.id,'duplicate',v_duplicate,'refund',v_refund);
end;
$$;
revoke all on function public.open_pack_atomic(uuid,int) from public,anon,authenticated;
grant execute on function public.open_pack_atomic(uuid,int) to service_role;
notify pgrst,'reload schema';

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
