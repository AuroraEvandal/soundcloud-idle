-- Build the complete public studio snapshot next to the data. This removes
-- repeated Edge -> PostgREST round trips on every batch of taps.
create or replace function public.studio_snapshot(p public.players) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'hype',p.hype,'hype_max',20,'energy',p.energy,'energy_max',100,
    'selected_beat_id',p.selected_beat_id,
    'income_pct',public.pet_income_pct(p.id) + coalesce((
      select sum(bonus_value) from (
        select e.bonus_value from public.player_equipment pe join public.equipment e on e.id=pe.equipment_id
          where pe.player_id=p.id and e.bonus_type='income_pct'
        union all
        select c.bonus_value from public.player_outfit po join public.clothing c on c.id=po.clothing_id
          where po.player_id=p.id and c.bonus_type='income_pct'
      ) b
    ),0),
    'beats',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'base_streams',b.base_streams,'price',b.price,
      'owned',b.price=0 or exists(select 1 from public.player_beats pb where pb.player_id=p.id and pb.beat_id=b.id)
    ) order by b.id) from public.beats b),'[]'::jsonb),
    'equipment',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.name,'price',e.price,'bonus',jsonb_build_object('type',e.bonus_type,'value',e.bonus_value),
      'owned',exists(select 1 from public.player_equipment pe where pe.player_id=p.id and pe.equipment_id=e.id)
    ) order by e.id) from public.equipment e),'[]'::jsonb)
  );
$$;

create or replace function public.get_studio_by_telegram(p_telegram_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.players;
begin
  select * into p from public.players where telegram_id=p_telegram_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into p from public.refresh_studio_energy(p.id);
  return jsonb_build_object('player',to_jsonb(p),'studio',public.studio_snapshot(p));
end;
$$;

create or replace function public.record_snippet_by_telegram(p_telegram_id bigint,p_taps int,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_player_id uuid; v_result jsonb; p public.players;
begin
  select id into v_player_id from public.players where telegram_id=p_telegram_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  v_result:=public.record_snippet_atomic(v_player_id,p_taps,p_request_id);
  -- Replayed batches keep the original energy/hype, so the client can reconcile
  -- its pending taps against precisely the operation being acknowledged.
  select * into p from jsonb_populate_record(null::public.players,v_result->'player');
  return v_result || jsonb_build_object('studio',public.studio_snapshot(p));
end;
$$;

revoke all on function public.studio_snapshot(public.players) from public,anon,authenticated;
revoke all on function public.get_studio_by_telegram(bigint) from public,anon,authenticated;
revoke all on function public.record_snippet_by_telegram(bigint,int,uuid) from public,anon,authenticated;
grant execute on function public.studio_snapshot(public.players) to service_role;
grant execute on function public.get_studio_by_telegram(bigint) to service_role;
grant execute on function public.record_snippet_by_telegram(bigint,int,uuid) to service_role;
notify pgrst,'reload schema';
