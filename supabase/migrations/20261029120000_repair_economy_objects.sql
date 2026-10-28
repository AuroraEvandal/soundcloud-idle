-- Repair objects missing from the remote database even though the original
-- economy migration is recorded as applied. All changes are additive and safe
-- to run on databases where the objects already exist.

alter table public.battles
  add column if not exists opponent_outfit jsonb;

create or replace function public.purchase_item(p_player_id uuid, p_kind text, p_item_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price int;
  v_owned boolean;
begin
  if p_kind = 'equipment' then
    select price into v_price from public.equipment where id = p_item_id;
    if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_equipment
      where player_id = p_player_id and equipment_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    update public.players set coins = coins - v_price
      where id = p_player_id and coins >= v_price returning coins into v_price;
    if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    insert into public.player_equipment (player_id, equipment_id) values (p_player_id, p_item_id);
  elsif p_kind = 'clothing' then
    select price into v_price from public.clothing where id = p_item_id;
    if not found or v_price is null then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_clothing
      where player_id = p_player_id and clothing_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    update public.players set coins = coins - v_price
      where id = p_player_id and coins >= v_price returning coins into v_price;
    if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    insert into public.player_clothing (player_id, clothing_id) values (p_player_id, p_item_id);
  elsif p_kind = 'beat' then
    select price into v_price from public.beats where id = p_item_id;
    if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;
    select exists (select 1 from public.player_beats
      where player_id = p_player_id and beat_id = p_item_id) into v_owned;
    if v_owned then raise exception using message = 'ALREADY_OWNED'; end if;
    if v_price > 0 then
      update public.players set coins = coins - v_price
        where id = p_player_id and coins >= v_price returning coins into v_price;
      if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;
    end if;
    insert into public.player_beats (player_id, beat_id) values (p_player_id, p_item_id);
    update public.players set selected_beat_id = p_item_id where id = p_player_id;
  else
    raise exception using message = 'ITEM_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.open_pack_atomic(p_player_id uuid, p_pack_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.packs%rowtype;
  v_coins int;
  v_item public.clothing%rowtype;
  v_card public.cards%rowtype;
  v_duplicate boolean;
  v_refund int := 0;
begin
  select * into v_pack from public.packs where id = p_pack_id;
  if not found then raise exception using message = 'ITEM_NOT_FOUND'; end if;

  update public.players set coins = coins - v_pack.price
    where id = p_player_id and coins >= v_pack.price
  returning coins into v_coins;
  if not found then raise exception using message = 'NOT_ENOUGH_COINS'; end if;

  if random() < v_pack.clothing_chance then
    select * into v_item from public.clothing c
    where not exists (
      select 1 from public.player_clothing pc
      where pc.player_id = p_player_id and pc.clothing_id = c.id
    )
    order by random() limit 1;
    if found then
      insert into public.player_clothing (player_id, clothing_id) values (p_player_id, v_item.id);
      return jsonb_build_object('type', 'clothing', 'item_id', v_item.id, 'duplicate', false, 'refund', 0);
    end if;
  end if;

  select * into v_card from public.cards c
  where not exists (
    select 1 from public.player_cards pc
    where pc.player_id = p_player_id and pc.card_id = c.id
  )
  order by -ln(random()) / (case c.rarity when 'common' then 70 when 'rare' then 24 else 6 end)
  limit 1;
  v_duplicate := not found;
  if not found then
    select * into v_card from public.cards c
    order by -ln(random()) / (case c.rarity when 'common' then 70 when 'rare' then 24 else 6 end)
    limit 1;
  end if;

  if v_duplicate then
    v_refund := case v_card.rarity when 'common' then 20 when 'rare' then 60 else 150 end;
    update public.players set coins = coins + v_refund where id = p_player_id;
    update public.player_cards set uses_left = 3
      where player_id = p_player_id and card_id = v_card.id;
  else
    insert into public.player_cards (player_id, card_id, uses_left) values (p_player_id, v_card.id, 3);
  end if;
  return jsonb_build_object('type', 'card', 'card_id', v_card.id, 'duplicate', v_duplicate, 'refund', v_refund);
end;
$$;

revoke all on function public.purchase_item(uuid, text, int) from public, anon, authenticated;
revoke all on function public.open_pack_atomic(uuid, int) from public, anon, authenticated;
grant execute on function public.purchase_item(uuid, text, int) to service_role;
grant execute on function public.open_pack_atomic(uuid, int) to service_role;
