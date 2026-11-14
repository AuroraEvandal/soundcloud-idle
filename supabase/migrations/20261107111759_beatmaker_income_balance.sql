-- Higher rewards for the shared 50-energy recording cost. Existing sales, releases
-- and saved idempotent responses retain their original payouts.
create or replace function public.sell_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b player_recorded_beats; v_payload jsonb; v_old beatmaker_requests; v_coins int; v_response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  v_payload:=jsonb_build_object('beat_id',p_beat_id);
  if found then
    if v_old.action<>'sell' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status<>'draft' then raise exception 'BEAT_ALREADY_PROCESSED'; end if;
  v_coins:=20+round(b.quality_score*0.8)::int+least(p.popularity,400)/20;
  update player_recorded_beats set status='sold',sale_coins=v_coins where id=b.id returning * into b;
  update players set coins=coins+v_coins where id=p_player_id returning * into p;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'coins_earned',v_coins);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'sell',v_payload,v_response);
  return v_response;
end;
$$;

create or replace function public.release_recorded_beat_atomic(p_player_id uuid,p_beat_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; b player_recorded_beats; v_payload jsonb; v_old beatmaker_requests; v_tier int:=0; v_max_tier int; v_advance numeric; v_cap bigint; v_response jsonb;
begin
  if p_request_id is null or p_beat_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  v_payload:=jsonb_build_object('beat_id',p_beat_id);
  if found then
    if v_old.action<>'release' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into b from player_recorded_beats where id=p_beat_id and player_id=p_player_id for update;
  if not found then raise exception 'BEAT_NOT_FOUND'; end if;
  if b.status<>'draft' then raise exception 'BEAT_ALREADY_PROCESSED'; end if;
  -- Popularity unlocks higher payout tiers. Each extra tier requires another successful roll,
  -- so the odds of the maximum tier fall exponentially while its stream cap doubles.
  v_max_tier:=least(6,1+floor(log(2,1+greatest(p.popularity,0)::numeric/100))::int);
  v_advance:=least(0.35,0.10+b.quality_score/400.0);
  while v_tier<v_max_tier and random()<v_advance loop v_tier:=v_tier+1; end loop;
  v_cap:=round((200+b.quality_score*10)*(1+least(p.popularity,400)/400.0)*power(2,v_tier))::bigint;
  update player_recorded_beats set status='streaming',stream_cap=v_cap,released_at=clock_timestamp() where id=b.id returning * into b;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'viral_tier',v_tier,'max_tier',v_max_tier,
    'max_streams',v_cap,'duration_hours',24);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'release',v_payload,v_response);
  return v_response;
end;
$$;

revoke all on function public.sell_recorded_beat_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sell_recorded_beat_atomic(uuid,uuid,uuid) to service_role;
revoke all on function public.release_recorded_beat_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_recorded_beat_atomic(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
