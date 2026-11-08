-- Run only against a trusted admin connection. Every fixture write is rolled back.
begin;
do $$
declare
  v_player uuid:=gen_random_uuid(); v_show uuid; v_terminal uuid:=gen_random_uuid(); v_buy uuid:=gen_random_uuid();
  v_state jsonb; v_event jsonb; v_payload jsonb; v_finished jsonb; v_replayed jsonb;
  v_kind text; v_prefix text; v_action text; v_stage text:='create fixture'; v_error text; v_context text;
  v_sample int; v_elapsed int; v_target int; v_index int; v_step int; v_count int;
begin
  insert into public.players(id,telegram_id,username,coins,xp,level)
    values(v_player,-(('x'||substr(replace(v_player::text,'-',''),1,14))::bit(56)::bigint),'concert_rollback_smoke',1000,0,1);
  set local role service_role;
  v_stage:='start';
  v_state:=public.concert_action(v_player,'start','{"episodeId":0,"choiceId":"artist"}',gen_random_uuid());
  v_show:=(v_state->'show'->>'id')::uuid;
  if jsonb_array_length(v_state->'show'->'events')<>12 then raise exception 'expected 12 events'; end if;
  for v_index in 0..11 loop
    v_event:=v_state->'show'->'events'->v_index;
    v_kind:=v_event->>'kind';
    v_stage:=format('scene %s %s',v_index,v_kind);
    v_payload:=jsonb_build_object('showId',v_show,'sceneId',v_event->>'id');
    if v_kind in ('frequency','level','crossfade') then
      if (v_event->>'secondary')::boolean then
        v_state:=public.concert_action(v_player,'input',v_payload||'{"actionId":"monitor"}',gen_random_uuid());
      end if;
      v_sample:=0;
      while v_sample<=(v_event->>'hold_ms')::int+600 and not (v_state->'show'->'outcomes' ? (v_event->>'id')) loop
        update public.concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>v_sample::double precision/1000) where id=v_show;
        if v_sample>0 then
          update public.concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-300)) where id=v_show;
        end if;
        v_target:=round((v_event->>'target')::numeric+case when (v_event->>'moving')::boolean then sin(v_sample/650.0)*(v_event->>'amplitude')::numeric else 0 end);
        v_prefix:=case when v_kind='frequency' then 'dial-' else 'fader-' end;
        v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId',v_prefix||v_target),gen_random_uuid());
        v_sample:=v_sample+300;
      end loop;
    elsif v_kind='feedback' then
      v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId','mute-'||(v_event->>'channel')),gen_random_uuid());
      v_elapsed:=(v_state->'show'->'scene_progress'->>'release_at_ms')::int+10;
      update public.concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>v_elapsed::double precision/1000) where id=v_show;
      v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId','unmute-'||(v_event->>'channel')),gen_random_uuid());
    elsif v_kind='artist' then
      v_action:=v_event->>'request';
      v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId',v_action),gen_random_uuid());
      v_elapsed:=(v_state->'show'->'scene_progress'->>'release_at_ms')::int+10;
      update public.concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>v_elapsed::double precision/1000) where id=v_show;
      v_action:=case when v_action='voice-off' then 'voice-on' else 'loop-off' end;
      v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId',v_action),gen_random_uuid());
    else
      if v_kind='blackout' then
        v_elapsed:=(v_event->>'reveal_ms')::int+10;
        update public.concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>v_elapsed::double precision/1000) where id=v_show;
      end if;
      v_prefix:=case v_kind when 'pads' then 'pad-' when 'patch' then 'patch-' when 'blackout' then 'memory-' when 'power' then 'power-' else null end;
      if v_prefix is null then raise exception 'unknown kind %',v_kind; end if;
      for v_step in 0..jsonb_array_length(v_event->'sequence')-1 loop
        v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId',v_prefix||(v_event->'sequence'->>v_step)),gen_random_uuid());
      end loop;
    end if;
    if not coalesce((v_state->'show'->'outcomes'->(v_event->>'id')->>'success')::boolean,false) then
      raise exception 'missing successful outcome, progress=%, outcomes=%, elapsed=%',v_state->'show'->'scene_progress',v_state->'show'->'outcomes',v_state->'show'->'scene_elapsed_ms';
    end if;
    v_stage:=v_stage||' next';
    v_state:=public.concert_action(v_player,'next',v_payload,case when v_index=11 then v_terminal else gen_random_uuid() end);
  end loop;
  v_stage:='assert finish'; v_finished:=v_state->'show'->'result';
  if v_state->'show'->>'status'<>'finished' or v_finished->>'rank'<>'S' or (v_finished->>'coins')::int<>135 or
    (v_finished->>'xp')::int<>20 or (v_state->'player'->>'coins')::int<>1135 or (v_state->'player'->>'xp')::int<>20 then
    raise exception 'unexpected finish %',v_state;
  end if;
  v_stage:='buy marks';
  v_state:=public.concert_action(v_player,'buy','{"itemId":"marks"}',v_buy);
  v_replayed:=public.concert_action(v_player,'buy','{"itemId":"marks"}',v_buy);
  if (v_state->'player'->>'coins')::int<>885 or (v_replayed->'player'->>'coins')::int<>885 or v_replayed->'career'->'upgrades'<>'["marks"]'::jsonb then
    raise exception 'purchase charged incorrectly %',v_replayed;
  end if;
  v_stage:='replay terminal next after purchase';
  v_replayed:=public.concert_action(v_player,'next',v_payload,v_terminal);
  if v_replayed->'show'->'result'<>v_finished or (v_replayed->'player'->>'coins')::int<>885 or
    (v_replayed->'player'->>'xp')::int<>20 or (v_replayed->'career'->>'paid_today')::int<>1 then
    raise exception 'terminal replay paid twice or returned stale balance %',v_replayed;
  end if;
  select count(*) into v_count from public.concert_shows where player_id=v_player and status='finished';
  if v_count<>1 then raise exception 'unexpected show count %',v_count; end if;
  v_stage:='moving control network regression';
  v_state:=public.concert_action(v_player,'start','{"episodeId":0,"choiceId":"artist"}',gen_random_uuid());
  v_show:=(v_state->'show'->>'id')::uuid;
  update public.concert_shows set events=jsonb_set(events,'{0}',events->0||'{"target":50,"moving":true,"amplitude":15,"tolerance":5,"hold_ms":1200,"secondary":false}') where id=v_show;
  v_payload:=jsonb_build_object('showId',v_show,'sceneId','scene-1');
  for v_sample in 0..2 loop
    v_elapsed:=v_sample*600;
    update public.concert_shows set scene_started_at=clock_timestamp()-make_interval(secs=>v_elapsed::double precision/1000) where id=v_show;
    if v_sample>0 then
      update public.concert_shows set progress=jsonb_set(progress,'{last_at}',to_jsonb(extract(epoch from clock_timestamp())*1000-600)) where id=v_show;
    end if;
    v_target:=round(50+sin(v_elapsed/650.0)*15);
    v_state:=public.concert_action(v_player,'input',v_payload||jsonb_build_object('actionId','dial-'||v_target),gen_random_uuid());
  end loop;
  if not coalesce((v_state->'show'->'outcomes'->'scene-1'->>'success')::boolean,false) then
    raise exception '600ms moving hold failed %',v_state->'show'->'scene_progress';
  end if;
  perform public.concert_action(v_player,'abandon',jsonb_build_object('showId',v_show),gen_random_uuid());
  reset role;
  perform set_config('concert.smoke_result',jsonb_build_object('ok',true,'player_id',v_player,'rpc_role','service_role','scenes',12,
    'result',v_finished,'coins_after_purchase',885,'terminal_replay','same result, current coins, no second payout','buy_replay','charged once','moving_600ms_hold','passed')::text,true);
exception when others then
  get stacked diagnostics v_error=message_text,v_context=pg_exception_context;
  reset role;
  perform set_config('concert.smoke_result',jsonb_build_object('ok',false,'player_id',v_player,'stage',v_stage,'error',v_error,'context',v_context)::text,true);
end;
$$;
select current_setting('concert.smoke_result')::jsonb as result;
rollback;
