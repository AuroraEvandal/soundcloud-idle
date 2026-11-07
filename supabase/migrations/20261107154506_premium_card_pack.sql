-- NULL weights preserve the editable global balance for the basic pack.
alter table public.packs
  add column if not exists common_weight numeric,
  add column if not exists rare_weight numeric,
  add column if not exists epic_weight numeric;
alter table public.packs drop constraint if exists packs_rarity_weights_check;
alter table public.packs add constraint packs_rarity_weights_check check (
  (common_weight is null and rare_weight is null and epic_weight is null)
  or (common_weight is not null and rare_weight is not null and epic_weight is not null
    and common_weight >= 0 and rare_weight >= 0 and epic_weight >= 0
    and common_weight + rare_weight + epic_weight > 0)
);

insert into public.packs(id,name,price,clothing_chance,common_weight,rare_weight,epic_weight)
values(2,'Премиальный пак',500,0.07,40,40,20)
on conflict(id) do update set name=excluded.name,price=excluded.price,
  clothing_chance=excluded.clothing_chance,common_weight=excluded.common_weight,
  rare_weight=excluded.rare_weight,epic_weight=excluded.epic_weight;
select setval(pg_get_serial_sequence('public.packs','id'),greatest((select max(id) from public.packs),1),true);

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
  if random()<v_pack.clothing_chance then
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
  -- Race only three weighted categories, then pick uniformly within the winner.
  select category into v_rarity from (values
    ('common',coalesce(v_pack.common_weight,v_balance.common_weight)),
    ('rare',coalesce(v_pack.rare_weight,v_balance.rare_weight)),
    ('epic',coalesce(v_pack.epic_weight,v_balance.epic_weight))
  ) w(category,weight) where weight>0 and exists(select 1 from public.cards c where c.rarity=category)
    order by -ln(greatest(random(),1e-15))/weight limit 1;
  if v_rarity is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_card from public.cards c where c.rarity=v_rarity
    order by exists(select 1 from public.player_cards pc where pc.player_id=p_player_id and pc.card_id=c.id),random() limit 1;
  v_duplicate:=exists(select 1 from public.player_cards where player_id=p_player_id and card_id=v_card.id);
  if v_duplicate then
    v_refund:=fan_income_coins(case v_card.rarity when 'common' then 20 when 'rare' then 60 else 150 end,
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
