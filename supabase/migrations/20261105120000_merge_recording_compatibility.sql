-- main used a different argument order; named PostgREST calls must resolve once.
drop function if exists public.record_snippet_atomic(uuid,uuid,int);
alter table public.snippet_requests add column if not exists taps int;
alter table public.snippet_requests add column if not exists created_at timestamptz not null default now();
create or replace function public.record_snippet_atomic(p_player_id uuid,p_taps int,p_request_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b beats; v_use int; v_total int; v_income int; v_pop_pct int; v_streams int; v_coins int;
  v_pop int; v_released jsonb:='[]'; v_response jsonb; v_previous snippet_requests;
begin
  if p_taps is null or p_taps<1 or p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_previous from snippet_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_previous.taps<>p_taps then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_previous.response;
  end if;
  select * into p from refresh_studio_energy(p_player_id);
  if p.energy<=0 then raise exception 'NO_ENERGY'; end if;
  v_use:=least(p_taps,200,p.energy); v_total:=p.hype+v_use;
  select * into b from beats where id=p.selected_beat_id;
  if not found then select * into b from beats where price=0 order by id limit 1; end if;
  if b.id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select coalesce(sum(bonus_value) filter(where bonus_type='income_pct'),0),coalesce(sum(bonus_value) filter(where bonus_type='popularity_pct'),0)
    into v_income,v_pop_pct from (
      select e.bonus_type,e.bonus_value from player_equipment pe join equipment e on e.id=pe.equipment_id where pe.player_id=p_player_id
      union all select c.bonus_type,c.bonus_value from player_outfit po join clothing c on c.id=po.clothing_id where po.player_id=p_player_id
    ) bonuses;
  for i in 1..(v_total/20) loop
    v_streams:=round(b.base_streams*(1+least(p.popularity,400)/200.0)*(1+(v_income+pet_income_pct(p_player_id))/100.0));
    v_coins:=round(v_streams/10.0);
    v_pop:=least(25,greatest(1,round(v_streams/100.0*(1+v_pop_pct/100.0))));
    p.popularity:=p.popularity+v_pop; p.coins:=p.coins+v_coins; p.streams:=p.streams+v_streams;
    v_released:=v_released||jsonb_build_array(jsonb_build_object('streams',v_streams,'coins',v_coins,'popularity_change',v_pop));
    insert into studio_releases(player_id) values(p_player_id);
  end loop;
  update players set energy=p.energy-v_use,energy_updated_at=p.energy_updated_at,hype=v_total%20,
    popularity=p.popularity,coins=p.coins,streams=p.streams,selected_beat_id=b.id where id=p_player_id returning * into p;
  v_response:=jsonb_build_object('player',to_jsonb(p),'released',v_released);
  insert into snippet_requests(player_id,request_id,taps,response) values(p_player_id,p_request_id,p_taps,v_response);
  return v_response;
end;
$$;
revoke all on function public.record_snippet_atomic(uuid,int,uuid) from public,anon,authenticated;
grant execute on function public.record_snippet_atomic(uuid,int,uuid) to service_role;
NOTIFY pgrst, 'reload schema';
