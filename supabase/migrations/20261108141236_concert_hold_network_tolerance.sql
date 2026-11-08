create or replace function public.concert_action(p_player_id uuid,p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
#variable_conflict use_variable
declare p players; c concert_careers; s concert_shows; previous concert_requests;
  event jsonb; progress jsonb; v_now timestamptz; now_ms numeric; scene_ms int; gap numeric; value int; target numeric; previous_target numeric; tolerance numeric;
  action_id text; kind text; step int; hold int; episode int; price int; item text;
  grade text; rep int; reward int; xp_reward int; bonus int; goal_reward int; first_clear boolean; first_goal boolean; paid boolean;
  result jsonb; show_id uuid; utc_day date; success boolean:=false;
begin
  if p_action is null or p_action not in ('get','start','buy','input','next','pause','resume','abandon') or
    p_payload is null or jsonb_typeof(p_payload)<>'object' or (p_action<>'get' and p_request_id is null) then raise exception 'CONCERT_INVALID_ACTION'; end if;
  -- All concert mutations lock in the same order: player, career, show.
  select * into p from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  insert into concert_careers(player_id) values(p_player_id) on conflict do nothing;
  select * into c from concert_careers where player_id=p_player_id for update;
  v_now:=clock_timestamp(); utc_day:=(v_now at time zone 'UTC')::date;
  if c.paid_day<>utc_day then
    update concert_careers set paid_day=utc_day,paid_today=0 where player_id=p_player_id returning * into c;
  end if;
  if p_action<>'get' then
    select * into previous from concert_requests where player_id=p_player_id and request_id=p_request_id;
    if found then
      if previous.action<>p_action or previous.payload<>p_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    end if;
  end if;
  if previous.request_id is not null and previous.show_id is not null then
    select * into s from concert_shows where id=previous.show_id and player_id=p_player_id for update;
  elsif p_action in ('get','start','buy') or previous.request_id is not null then
    select * into s from concert_shows where player_id=p_player_id and status='active' for update;
  else
    if coalesce(p_payload->>'showId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'CONCERT_INVALID_ACTION'; end if;
    select * into s from concert_shows where id=(p_payload->>'showId')::uuid and player_id=p_player_id for update;
    if not found then raise exception 'CONCERT_NOT_FOUND'; end if;
  end if;
  if s.id is not null and s.status='active' then
    event:=s.events->s.scene_index;
    scene_ms:=least((event->>'duration')::int*1000,s.scene_base_ms+case when s.scene_started_at is null then 0 else greatest(0,floor(extract(epoch from v_now-s.scene_started_at)*1000)) end)::int;
    if not (s.outcomes ? (event->>'id')) and (scene_ms>=(event->>'duration')::int*1000 or (s.paused_at is not null and v_now-s.paused_at>interval '120 seconds')) then
      perform concert_resolve(s.id,false,'timeout');
      select * into s from concert_shows where id=s.id;
    end if;
  end if;
  if previous.request_id is not null then return concert_view(p_player_id,s.id); end if;
  if p_action='get' then return concert_view(p_player_id,s.id); end if;
  if p_action='buy' then
    item:=p_payload->>'itemId';
    price:=case item when 'marks' then 250 when 'knobs' then 450 when 'guard' then 800 when 'effects' then 1200 when 'amber' then 300 else null end;
    if price is null then raise exception 'CONCERT_INVALID_ACTION'; end if;
    if item=any(c.upgrades) then raise exception 'ALREADY_OWNED'; end if;
    if p.coins<price then raise exception 'NOT_ENOUGH_COINS'; end if;
    update players set coins=coins-price where id=p_player_id;
    update concert_careers set upgrades=array_append(upgrades,item) where player_id=p_player_id;
  elsif p_action='start' then
    if coalesce(p_payload->>'episodeId','')!~'^[0-5]$' or coalesce(p_payload->>'choiceId','') not in ('artist','owner') then raise exception 'CONCERT_INVALID_ACTION'; end if;
    episode:=(p_payload->>'episodeId')::int;
    if episode>0 and not (episode-1=any(c.completed)) then raise exception 'CONCERT_LOCKED'; end if;
    if s.id is not null then raise exception 'CONCERT_SCENE_ACTIVE'; end if;
    event:=concert_events(episode,p_payload->>'choiceId',c.upgrades);
    insert into concert_shows(player_id,episode,choice,events,scene_started_at,progress)
      values(p_player_id,episode,p_payload->>'choiceId',event,v_now,concert_progress(event->0)) returning * into s;
  elsif p_action='abandon' then
    if s.status='active' then
      update concert_shows set status='abandoned',scene_base_ms=scene_ms,scene_started_at=null,paused_at=null,finished_at=v_now where id=s.id;
    end if;
  elsif s.status<>'active' then
    if p_action<>'next' then raise exception 'CONCERT_INVALID_ACTION'; end if;
  elsif p_action='pause' then
    if s.paused_at is null and not (s.outcomes ? (event->>'id')) then
      update concert_shows set scene_base_ms=scene_ms,scene_started_at=null,paused_at=v_now,progress=s.progress-'last_at'||'{"hold_ms":0}' where id=s.id;
    end if;
  elsif p_action='resume' then
    if s.paused_at is not null then update concert_shows set scene_started_at=v_now,paused_at=null where id=s.id; end if;
  elsif p_action='next' then
    if coalesce(p_payload->>'sceneId','')<>event->>'id' then raise exception 'CONCERT_INVALID_ACTION'; end if;
    if s.paused_at is not null then raise exception 'CONCERT_PAUSED'; end if;
    if not (s.outcomes ? (event->>'id')) then raise exception 'CONCERT_SCENE_ACTIVE'; end if;
    if s.scene_index<11 then
      update concert_shows set elapsed_base_ms=elapsed_base_ms+scene_base_ms,scene_base_ms=0,scene_index=scene_index+1,
        scene_started_at=v_now,progress=concert_progress(events->(scene_index+1)) where id=s.id;
    else
      grade:=case when s.quality>=90 then 'S' when s.quality>=75 then 'A' when s.quality>=55 then 'B' else 'C' end;
      first_clear:=grade<>'C' and not (s.episode=any(c.completed));
      first_goal:=s.best_combo>=6 and not (s.episode=any(c.goals));
      paid:=grade<>'C' and c.paid_today<5;
      rep:=case grade when 'S' then 25 when 'A' then 15 when 'B' then 10 else 0 end;
      reward:=case when paid then case grade when 'S' then 60 when 'A' then 45 else 30 end else 0 end;
      xp_reward:=case when paid then case grade when 'S' then 20 when 'A' then 15 else 10 end else 0 end;
      bonus:=case when paid and first_clear then 50 else 0 end;
      goal_reward:=case when paid and first_goal then 25 else 0 end;
      update concert_careers set reputation=reputation+rep,
        completed=case when first_clear then array_append(completed,s.episode) else completed end,
        goals=case when first_goal then array_append(goals,s.episode) else goals end,
        trust=trust+case when grade<>'C' and s.choice='artist' then 2 else 0 end,
        reliability=reliability+case when grade<>'C' and s.choice='owner' then 2 else 0 end,
        paid_today=paid_today+case when paid then 1 else 0 end where player_id=p_player_id;
      p.xp:=p.xp+xp_reward;
      while p.xp>=round(100*power(1.1,p.level-1)) loop
        p.xp:=p.xp-round(100*power(1.1,p.level-1)); p.level:=p.level+1;
      end loop;
      update players set coins=coins+reward+bonus+goal_reward,xp=p.xp,level=p.level where id=p_player_id;
      result:=jsonb_build_object('rank',grade,'grade',grade,'accuracy',s.quality,'quality',s.quality,'base',reward,'bonus',bonus+goal_reward,'goal',first_goal,'combo_bonus',goal_reward,
        'first',first_clear,'goalFirst',first_goal,'coins',reward+bonus+goal_reward,'xp',xp_reward,'reputation',rep,'paid',paid);
      update concert_shows set status='finished',result=result,finished_at=v_now where id=s.id;
    end if;
  elsif p_action='input' then
    if coalesce(p_payload->>'sceneId','')<>event->>'id' then raise exception 'CONCERT_INVALID_ACTION'; end if;
    if s.paused_at is not null then raise exception 'CONCERT_PAUSED'; end if;
    if not (s.outcomes ? (event->>'id')) then
      action_id:=p_payload->>'actionId'; kind:=event->>'kind'; progress:=s.progress;
      if action_id='timeout' then
        raise exception 'CONCERT_SCENE_ACTIVE';
      elsif kind in ('frequency','level','crossfade') then
        if action_id='monitor' and (event->>'secondary')::boolean then
          progress:=progress||'{"monitor":true}';
          success:=(progress->>'hold_ms')::int>=(event->>'hold_ms')::int;
        else
          if (kind='frequency' and coalesce(action_id,'')!~'^dial-([0-9]|[1-9][0-9]|100)$') or
            (kind<>'frequency' and coalesce(action_id,'')!~'^fader-([0-9]|[1-9][0-9]|100)$') then raise exception 'CONCERT_INVALID_ACTION'; end if;
          value:=split_part(action_id,'-',2)::int;
          now_ms:=extract(epoch from v_now)*1000;
          gap:=now_ms-(progress->>'last_at')::numeric;
          target:=(event->>'target')::numeric; previous_target:=target;
          tolerance:=(event->>'tolerance')::numeric;
          if (event->>'moving')::boolean then
            tolerance:=tolerance+4;
            -- Compare each endpoint with the target at its own server sample time.
            previous_target:=greatest(0,least(100,target+sin(coalesce((progress->>'sample_ms')::numeric,greatest(0,scene_ms-gap))/650.0)*(event->>'amplitude')::numeric));
            target:=greatest(0,least(100,target+sin(scene_ms/650.0)*(event->>'amplitude')::numeric));
          end if;
          hold:=coalesce((progress->>'hold_ms')::int,0);
          if abs(value-target)>tolerance then hold:=0;
          elsif gap between 180 and 700 and abs((progress->>'value')::int-previous_target)<=tolerance then hold:=hold+floor(gap)::int;
          elsif gap is null or gap>=180 then hold:=0; end if;
          -- Very fast packets never advance the hold clock, including repeated request IDs.
          if gap is null or gap>=180 or abs(value-target)>tolerance then
            progress:=progress||jsonb_build_object('last_at',now_ms,'sample_ms',scene_ms,'value',value,'hold_ms',hold);
          end if;
          success:=hold>=(event->>'hold_ms')::int and (not (event->>'secondary')::boolean or (progress->>'monitor')::boolean);
        end if;
      elsif kind in ('pads','patch','blackout','power') then
        if coalesce(action_id,'')!~('^'||case kind when 'pads' then 'pad' when 'patch' then 'patch' when 'blackout' then 'memory' else 'power' end||'-[0-3]$') then raise exception 'CONCERT_INVALID_ACTION'; end if;
        if kind='blackout' and scene_ms<(event->>'reveal_ms')::int then raise exception 'CONCERT_INVALID_ACTION'; end if;
        step:=(progress->>'step')::int;
        if split_part(action_id,'-',2)::int<>(event->'sequence'->>step)::int then perform concert_resolve(s.id,false,'sequence');
        else
          progress:=progress||jsonb_build_object('step',step+1);
          success:=step+1=jsonb_array_length(event->'sequence');
        end if;
      elsif kind='feedback' then
        if coalesce(action_id,'')!~'^(mute|unmute)-[0-2]$' then raise exception 'CONCERT_INVALID_ACTION'; end if;
        if action_id='mute-'||(event->>'channel') and (progress->>'step')::int=0 then
          progress:=progress||jsonb_build_object('muted',jsonb_build_array((event->>'channel')::int),'step',1,'muted_at',scene_ms,'release_at_ms',scene_ms+600);
        elsif action_id='unmute-'||(event->>'channel') and (progress->>'step')::int=1 then
          if scene_ms-(progress->>'muted_at')::int<600 then raise exception 'CONCERT_INVALID_ACTION'; end if;
          progress:=progress||'{"muted":[],"step":2}'; success:=true;
        else perform concert_resolve(s.id,false,'channel'); end if;
      elsif kind='artist' then
        if coalesce(action_id,'') not in ('voice-off','voice-on','loop-on','loop-off') then raise exception 'CONCERT_INVALID_ACTION'; end if;
        if action_id=event->>'request' and (progress->>'step')::int=0 then
          progress:=progress||jsonb_build_object('voice',case when action_id like 'voice-%' then action_id='voice-on' else (progress->>'voice')::boolean end,
            'loop',case when action_id like 'loop-%' then action_id='loop-on' else (progress->>'loop')::boolean end,'step',1,'command_at',scene_ms,'release_at_ms',scene_ms+1000);
        elsif action_id=(case event->>'request' when 'voice-off' then 'voice-on' else 'loop-off' end) and (progress->>'step')::int=1 then
          if scene_ms-(progress->>'command_at')::int<1000 then raise exception 'CONCERT_INVALID_ACTION'; end if;
          progress:=progress||jsonb_build_object('voice',case when action_id='voice-on' then true else (progress->>'voice')::boolean end,'loop',false,'step',2); success:=true;
        else perform concert_resolve(s.id,false,'request'); end if;
      else raise exception 'CONCERT_INVALID_ACTION'; end if;
      update concert_shows set progress=progress where id=s.id;
      if success then perform concert_resolve(s.id,true,'complete'); end if;
    end if;
  end if;
  insert into concert_requests(player_id,request_id,action,payload,show_id) values(p_player_id,p_request_id,p_action,p_payload,s.id);
  return concert_view(p_player_id,s.id);
end;
$$;
