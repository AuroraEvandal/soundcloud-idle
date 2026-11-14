-- Existing duplicates and payouts remain intact; new copies are rejected.
alter table public.player_recorded_beats add column if not exists name text not null default 'Без названия'
  check (char_length(name) between 1 and 60 and name=btrim(name));

create or replace function public.canonical_beat_pattern(p jsonb) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'drums', jsonb_build_object(
      'kick',(select coalesce(jsonb_agg(v order by v::int),'[]') from jsonb_array_elements(coalesce(p->'drums'->'kick','[]')) v),
      'snare',(select coalesce(jsonb_agg(v order by v::int),'[]') from jsonb_array_elements(coalesce(p->'drums'->'snare','[]')) v),
      'hihat',(select coalesce(jsonb_agg(v order by v::int),'[]') from jsonb_array_elements(coalesce(p->'drums'->'hihat','[]')) v)),
    'piano',(select coalesce(jsonb_agg(v order by (v->>'step')::int,(v->>'note')::int),'[]') from jsonb_array_elements(coalesce(p->'piano','[]')) v),
    'melody',(select coalesce(jsonb_agg(v order by (v->>'step')::int,(v->>'note')::int),'[]') from jsonb_array_elements(coalesce(p->'melody','[]')) v));
$$;
revoke all on function public.canonical_beat_pattern(jsonb) from public,anon,authenticated;
grant execute on function public.canonical_beat_pattern(jsonb) to service_role;
create index if not exists recorded_beats_content_idx on public.player_recorded_beats
  (player_id,genre,bpm,musical_key,scale,md5(public.canonical_beat_pattern(pattern)::text));

drop function if exists public.record_beat_atomic(uuid,uuid,text,int,int,text,jsonb,int,jsonb);
create or replace function public.record_beat_atomic(
  p_player_id uuid,p_request_id uuid,p_genre text,p_bpm int,p_key int,p_scale text,
  p_pattern jsonb,p_quality_score int,p_score_breakdown jsonb,p_name text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p players; v_payload jsonb; v_old beatmaker_requests; v_beat player_recorded_beats; v_response jsonb;
  v_name text:=coalesce(nullif(btrim(p_name),''),'Без названия'); v_pattern jsonb;
begin
  if p_request_id is null or p_genre not in ('trap','plugg','cloud_rap','drill','phonk') or p_bpm not between 60 and 180 or
     p_key not between 0 and 11 or p_scale not in ('major','minor') or p_quality_score not between 0 and 100 then
    raise exception 'INVALID_BEAT';
  end if;
  if char_length(v_name)>60 then raise exception 'INVALID_BEAT_NAME'; end if;
  v_pattern:=canonical_beat_pattern(p_pattern);
  v_payload:=jsonb_build_object('genre',p_genre,'bpm',p_bpm,'key',p_key,'scale',p_scale,'pattern',p_pattern);
  if nullif(btrim(p_name),'') is not null then v_payload:=v_payload||jsonb_build_object('name',v_name); end if;
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_old from beatmaker_requests where player_id=p_player_id and request_id=p_request_id;
  if found then
    if v_old.action<>'record' or v_old.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_old.response;
  end if;
  -- The owner lock serializes simultaneous recordings before any energy charge.
  if exists(select 1 from player_recorded_beats where player_id=p_player_id
      and genre=p_genre and bpm=p_bpm and musical_key=p_key and scale=p_scale
      and md5(canonical_beat_pattern(pattern)::text)=md5(v_pattern::text)
      and canonical_beat_pattern(pattern)=v_pattern) then raise exception 'DUPLICATE_BEAT'; end if;
  select * into p from refresh_studio_energy(p_player_id);
  if p.energy<50 then raise exception 'NO_ENERGY'; end if;
  update players set energy=p.energy-50,energy_updated_at=p.energy_updated_at where id=p_player_id returning * into p;
  insert into player_recorded_beats(name,player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown)
    values(v_name,p_player_id,p_genre,p_bpm,p_key,p_scale,p_pattern,p_quality_score,p_score_breakdown) returning * into v_beat;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(v_beat),'energy_cost',50);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'record',v_payload,v_response);
  return v_response;
end;
$$;
revoke all on function public.record_beat_atomic(uuid,uuid,text,int,int,text,jsonb,int,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_beat_atomic(uuid,uuid,text,int,int,text,jsonb,int,jsonb,text) to service_role;
notify pgrst,'reload schema';
