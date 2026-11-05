-- A single editable row for MVP coefficients; browser clients cannot change it.
create table if not exists public.game_balance (
  id boolean primary key default true check(id),
  skill_step numeric not null default 0.02 check(skill_step between 0 and 1),
  charisma_step numeric not null default 0.01 check(charisma_step between 0 and 1),
  max_skill_bonus numeric not null default 0.5 check(max_skill_bonus between 0 and 2),
  common_weight numeric not null default 70 check(common_weight>=0),
  rare_weight numeric not null default 24 check(rare_weight>=0),
  epic_weight numeric not null default 6 check(epic_weight>=0),
  check(common_weight+rare_weight+epic_weight>0)
);
insert into public.game_balance(id) values(true) on conflict do nothing;
alter table public.game_balance enable row level security;
revoke all on public.game_balance from public,anon,authenticated;
grant all on public.game_balance to service_role;

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
    ('common',v_balance.common_weight),('rare',v_balance.rare_weight),('epic',v_balance.epic_weight)
  ) w(category,weight) where weight>0 and exists(select 1 from public.cards c where c.rarity=category)
    order by -ln(greatest(random(),1e-15))/weight limit 1;
  if v_rarity is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_card from public.cards c where c.rarity=v_rarity
    order by exists(select 1 from public.player_cards pc where pc.player_id=p_player_id and pc.card_id=c.id),random() limit 1;
  v_duplicate:=exists(select 1 from public.player_cards where player_id=p_player_id and card_id=v_card.id);
  if v_duplicate then
    v_refund:=case v_card.rarity when 'common' then 20 when 'rare' then 60 else 150 end;
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
