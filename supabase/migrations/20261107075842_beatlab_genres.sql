-- Keep legacy records and idempotent retries valid while adding the three current styles.
ALTER TABLE public.player_recorded_beats DROP CONSTRAINT player_recorded_beats_genre_check;
ALTER TABLE public.player_recorded_beats ADD CONSTRAINT player_recorded_beats_genre_check CHECK (genre IN ('trap','plugg','cloud_rap','drill','phonk'));

create or replace function public.record_beat_atomic(
  p_player_id uuid,p_request_id uuid,p_genre text,p_bpm int,p_key int,p_scale text,
  p_pattern jsonb,p_quality_score int,p_score_breakdown jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; v_payload jsonb; v_old beatmaker_requests; v_beat player_recorded_beats; v_response jsonb;
begin
  if p_request_id is null or p_genre not in ('trap','plugg','cloud_rap','drill','phonk') or p_bpm not between 60 and 180 or
     p_key not between 0 and 11 or p_scale not in ('major','minor') or p_quality_score not between 0 and 100 then
    raise exception 'INVALID_BEAT';
  end if;
  v_payload:=jsonb_build_object('genre',p_genre,'bpm',p_bpm,'key',p_key,'scale',p_scale,'pattern',p_pattern);
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_old.action<>'record' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  select * into p from refresh_studio_energy(p_player_id);
  if p.energy<50 then raise exception 'NO_ENERGY'; end if;
  update players set energy=p.energy-50,energy_updated_at=p.energy_updated_at where id=p_player_id returning * into p;
  insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown)
    values(p_player_id,p_genre,p_bpm,p_key,p_scale,p_pattern,p_quality_score,p_score_breakdown) returning * into v_beat;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(v_beat),'energy_cost',50);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'record',v_payload,v_response);
  return v_response;
end;
$$;


revoke all on function public.record_beat_atomic(uuid,uuid,text,int,int,text,jsonb,int,jsonb) from public,anon,authenticated;
grant execute on function public.record_beat_atomic(uuid,uuid,text,int,int,text,jsonb,int,jsonb) to service_role;
notify pgrst,'reload schema';
