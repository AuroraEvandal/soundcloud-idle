-- One fan multiplier for all coin income: +1% per full 100 fans, without a cap.
-- Existing saved responses and released stream caps retain their original values.
create or replace function public.fan_income_multiplier(p_popularity int) returns numeric
language sql immutable set search_path=public as $$
  select 1 + (greatest(coalesce(p_popularity,0),0)/100)::numeric/100;
$$;
create or replace function public.fan_income_coins(p_base numeric,p_popularity int) returns int
language sql immutable set search_path=public as $$
  select round(p_base * public.fan_income_multiplier(p_popularity))::int;
$$;
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
    v_streams:=round(b.base_streams*(1+(v_income+pet_income_pct(p_player_id))/100.0));
    v_coins:=fan_income_coins(v_streams/10.0,p.popularity);
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
  v_coins:=fan_income_coins(20+round(b.quality_score*0.8),p.popularity);
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
  v_cap:=round((200+b.quality_score*10)*fan_income_multiplier(p.popularity)*power(2,v_tier))::bigint;
  update player_recorded_beats set status='streaming',stream_cap=v_cap,released_at=clock_timestamp() where id=b.id returning * into b;
  v_response:=jsonb_build_object('player',to_jsonb(p),'beat',to_jsonb(b),'viral_tier',v_tier,'max_tier',v_max_tier,
    'max_streams',v_cap,'duration_hours',24);
  insert into beatmaker_requests(player_id,request_id,action,payload,response) values(p_player_id,p_request_id,'release',v_payload,v_response);
  return v_response;
end;
$$;
create or replace function public.submit_round_atomic(
  p_player_id uuid,
  p_battle_id uuid,
  p_round_number int,
  p_request_id uuid,
  p_card_ids int[],
  p_round_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles%rowtype;
  v_player public.players%rowtype;
  v_existing public.rounds%rowtype;
  v_next_hand int[];
  v_round_winner text;
  v_player_wins int;
  v_opponent_wins int;
  v_player_total int;
  v_opponent_total int;
  v_done boolean;
  v_result text;
  v_xp_change int := 0;
  v_pop_change int := 0;
  v_coins_change int := 0;
  v_floor int;
  v_level_up boolean := false;
  v_new_level int;
  v_pop_before int;
  v_random_skill int;
  v_response jsonb;
  v_next jsonb;
  v_hand jsonb;
  v_mini public.battle_mini_games%rowtype;
  v_penalty int := 0;
  v_base_points int;
  v_final_points int;
begin
  if p_request_id is null then raise exception using message = 'INVALID_REQUEST_ID'; end if;
  select * into v_battle from public.battles where id = p_battle_id and player_id = p_player_id for update;
  if not found then raise exception using message = 'BATTLE_NOT_FOUND'; end if;

  select * into v_existing from public.rounds where battle_id = p_battle_id and round_number = p_round_number;
  if found then
    if v_existing.request_id = p_request_id then
      if v_existing.card_ids <> p_card_ids then raise exception using message = 'IDEMPOTENCY_CONFLICT'; end if;
      return v_existing.result_payload;
    end if;
    raise exception using message = 'ROUND_ALREADY_SUBMITTED';
  end if;
  if v_battle.status = 'finished' then raise exception using message = 'BATTLE_FINISHED'; end if;
  if p_round_number <> v_battle.current_round then raise exception using message = 'INVALID_ROUND'; end if;
  if cardinality(p_card_ids) <> 4 or (select count(distinct chosen.card_id) from unnest(p_card_ids) as chosen(card_id)) <> 4 then
    raise exception using message = 'INVALID_CARDS';
  end if;
  if not (p_card_ids <@ v_battle.current_hand) then raise exception using message = 'INVALID_CARDS'; end if;
  if exists (
    select 1 from unnest(p_card_ids) chosen(id)
    left join public.cards c on c.id = chosen.id
    left join public.player_cards pc on pc.card_id = c.id and pc.player_id = p_player_id
    where c.id is null or pc.card_id is null
  ) then raise exception using message = 'CARD_NOT_OWNED'; end if;
  if exists (
    select 1 from public.player_cards pc
    where pc.player_id = p_player_id and pc.card_id = any(p_card_ids) and pc.uses_left <= 0
  ) then raise exception using message = 'CARD_BURNED'; end if;

  -- Resolve the saved penalty under the same battle lock, before cards/rewards.
  if p_round_number > 1 then
    select * into v_mini from public.battle_mini_games
      where battle_id=p_battle_id and round_number=p_round_number;
    if not found or v_mini.penalty_points is null then
      raise exception using message='MINI_GAME_REQUIRED';
    end if;
    v_penalty := v_mini.penalty_points;
  end if;
  v_base_points := (p_round_data->'round'->'player'->>'points')::int;
  v_final_points := greatest(0, v_base_points-v_penalty);
  p_round_data := jsonb_set(p_round_data, '{round,player}', (p_round_data->'round'->'player') ||
    jsonb_build_object('base_points',v_base_points,'penalty_points',v_penalty,'points',v_final_points));
  p_round_data := jsonb_set(p_round_data, '{round,winner}', to_jsonb(case
    when v_final_points > (p_round_data->'round'->'opponent'->>'points')::int then 'player'
    when v_final_points < (p_round_data->'round'->'opponent'->>'points')::int then 'opponent'
    else 'draw' end));
  p_round_data := jsonb_set(p_round_data, '{round,mini_game}', case when p_round_number=1 then 'null'::jsonb else
    jsonb_build_object('kind',v_mini.kind,'penalty_points',v_penalty,'message',case
      when v_penalty=0 then 'Концентрация сохранена'
      when v_mini.kind='slang' then 'Забыл текст на**й!'
      when v_mini.kind='timing' then 'Мимо! Штрафные баллы!'
      else 'Микрофон фонит! Сбился с волны.' end) end);

  select * into v_player from public.players where id = p_player_id for update;

  update public.player_cards pc
  set uses_left = pc.uses_left - 1
  where pc.player_id = p_player_id
    and pc.card_id = any(p_card_ids)
    and not exists (
      select 1
      from public.rounds r
      cross join unnest(r.card_ids) as prev(card_id)
      where r.battle_id = p_battle_id and prev.card_id = pc.card_id
    );

  v_round_winner := p_round_data->'round'->>'winner';
  if v_round_winner not in ('player', 'opponent', 'draw') then raise exception using message = 'INVALID_ROUND_RESULT'; end if;
  v_player_wins := v_battle.player_rounds_won + case when v_round_winner = 'player' then 1 else 0 end;
  v_opponent_wins := v_battle.opponent_rounds_won + case when v_round_winner = 'opponent' then 1 else 0 end;
  select coalesce(sum(player_points), 0) into v_player_total from public.rounds where battle_id = p_battle_id;
  select coalesce(sum(opponent_points), 0) into v_opponent_total from public.rounds where battle_id = p_battle_id;
  v_player_total := v_player_total + (p_round_data->'round'->'player'->>'points')::int;
  v_opponent_total := v_opponent_total + (p_round_data->'round'->'opponent'->>'points')::int;
  v_done := v_player_wins >= 2 or v_opponent_wins >= 2 or p_round_number >= 3;

  if v_done then
    if v_player_wins > v_opponent_wins then v_result := 'win';
    elsif v_player_wins < v_opponent_wins then v_result := 'lose';
    elsif v_player_total > v_opponent_total then v_result := 'win';
    else v_result := 'lose'; end if;

    if v_result = 'win' then
      v_xp_change := 25; v_pop_change := 15; v_coins_change := fan_income_coins(50,v_player.popularity);
    elsif v_result = 'lose' then
      v_xp_change := -(10 + floor(random() * 6)::int);
      v_pop_change := -(5 + floor(random() * 6)::int);
    end if;
    select coalesce(max(required_popularity), 0) into v_floor
    from public.locations where required_popularity <= v_player.popularity;
    v_pop_before := v_player.popularity;
    update public.players
    set xp = greatest(0, xp + v_xp_change),
        popularity = greatest(v_floor, popularity + v_pop_change),
        coins = coins + v_coins_change
    where id = p_player_id
    returning * into v_player;
    v_pop_change := v_player.popularity - v_pop_before;

    while v_player.xp >= round(100 * power(1.1, v_player.level - 1)) loop
      v_random_skill := floor(random() * 4)::int;
      update public.players
        set xp = xp - round(100 * power(1.1, level - 1)),
            level = level + 1,
            skill_rhyme = skill_rhyme + case when v_random_skill = 0 then 1 else 0 end,
            skill_flow = skill_flow + case when v_random_skill = 1 then 1 else 0 end,
            skill_punch = skill_punch + case when v_random_skill = 2 then 1 else 0 end,
            skill_charisma = skill_charisma + case when v_random_skill = 3 then 1 else 0 end
        where id = p_player_id returning * into v_player;
      v_level_up := true;
    end loop;
    v_new_level := v_player.level;
  end if;

  if not v_done then
    v_next_hand := public.make_battle_hand(p_player_id, p_battle_id, false);
    v_hand := public.hand_json(p_player_id, v_next_hand);
    v_next := jsonb_build_object('number', p_round_number + 1, 'theme', v_battle.themes[p_round_number + 1]);
  else
    v_hand := null;
    v_next := null;
  end if;

  v_response := jsonb_build_object(
    'round', p_round_data->'round',
    'battle', jsonb_strip_nulls(jsonb_build_object(
      'status', case when v_done then 'finished' else 'active' end,
      'result', case when v_done then v_result else null end,
      'player_rounds_won', v_player_wins,
      'opponent_rounds_won', v_opponent_wins
    )),
    'next_round', v_next,
    'hand', v_hand,
    'rewards', case when v_done then jsonb_build_object(
      'xp_change', v_xp_change,
      'popularity_change', v_pop_change,
      'coins_change', v_coins_change,
      'level_up', v_level_up,
      'new_level', v_new_level
    ) else null end
  );

  insert into public.rounds (
    battle_id, round_number, theme, card_ids, lines, rhyme_score, flow_score,
    punch_score, meaning_score, judge_comment, player_points, opponent_points,
    winner, request_id, result_payload
  ) values (
    p_battle_id, p_round_number, p_round_data->'round'->>'theme', p_card_ids,
    p_round_data->'round'->'player'->'lines',
    (p_round_data->'round'->'player'->'scores'->>'rhyme')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'flow')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'punch')::numeric,
    (p_round_data->'round'->'player'->'scores'->>'meaning')::numeric,
    p_round_data->'round'->'player'->>'comment',
    (p_round_data->'round'->'player'->>'points')::int,
    (p_round_data->'round'->'opponent'->>'points')::int,
    v_round_winner, p_request_id, v_response
  );

  update public.battles set
    player_rounds_won = v_player_wins,
    opponent_rounds_won = v_opponent_wins,
    current_round = case when v_done then current_round else current_round + 1 end,
    current_hand = case when v_done then null else v_next_hand end,
    status = case when v_done then 'finished' else 'active' end,
    result = case when v_done then v_result else null end,
    xp_reward = v_xp_change,
    popularity_reward = case when v_done then v_pop_change else 0 end,
    finished_at = case when v_done then now() else null end
  where id = p_battle_id;

  return v_response;
end;
$$;
create or replace function public.award_case_drop(p_player_id uuid,p_case_id text,p_roll double precision,p_pet_roll double precision) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c case_catalog; v_pet text; v_level int; v_duplicate boolean; v_refund int:=0; v_popularity int; v_coins int;
begin
  select popularity into v_popularity from players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into c from case_catalog where id=p_case_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_roll is null or p_pet_roll is null or p_roll<0 or p_roll>=1 or p_pet_roll<0 or p_pet_roll>=1 then raise exception 'INVALID_REQUEST'; end if;
  if p_roll>=c.pet_chance then
    v_coins:=fan_income_coins(c.fallback_coins,v_popularity);
    update players set coins=coins+v_coins where id=p_player_id;
    return jsonb_build_object('type','coins','coins',v_coins);
  end if;
  v_pet:=(array['soundity','micity','scalevillity'])[1+floor(p_pet_roll*3)::int];
  select level into v_level from player_pets where player_id=p_player_id and pet_id=v_pet;
  v_duplicate:=found;
  if not v_duplicate then
    v_level:=1;
    insert into player_pets(player_id,pet_id) values(p_player_id,v_pet);
  elsif v_level<3 then
    v_level:=v_level+1;
    update player_pets set level=v_level where player_id=p_player_id and pet_id=v_pet;
  else
    v_refund:=fan_income_coins(300,v_popularity);
    update players set coins=coins+v_refund where id=p_player_id;
  end if;
  return jsonb_build_object('type','pet','pet_id',v_pet,'level',v_level,'duplicate',v_duplicate,'refund',v_refund);
end;
$$;
create or replace function public.cases_view(p_player_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'price_stars',c.price_stars,'pet_chance',c.pet_chance,'fallback_coins',fan_income_coins(c.fallback_coins,(select popularity from players where id=p_player_id)),
    'available_at',case when c.id='free' then (select max(created_at)+interval '24 hours' from case_openings where player_id=p_player_id and case_id='free') else null end
  ) order by c.price_stars) from case_catalog c),'pets',pets_view(p_player_id));
$$;
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
revoke all on function public.fan_income_multiplier(int) from public,anon,authenticated;
grant execute on function public.fan_income_multiplier(int) to service_role;
revoke all on function public.fan_income_coins(numeric,int) from public,anon,authenticated;
grant execute on function public.fan_income_coins(numeric,int) to service_role;
revoke all on function public.record_snippet_atomic(uuid,int,uuid) from public,anon,authenticated;
grant execute on function public.record_snippet_atomic(uuid,int,uuid) to service_role;
revoke all on function public.sell_recorded_beat_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sell_recorded_beat_atomic(uuid,uuid,uuid) to service_role;
revoke all on function public.release_recorded_beat_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_recorded_beat_atomic(uuid,uuid,uuid) to service_role;
revoke all on function public.submit_round_atomic(uuid,uuid,int,uuid,int[],jsonb) from public,anon,authenticated;
grant execute on function public.submit_round_atomic(uuid,uuid,int,uuid,int[],jsonb) to service_role;
revoke all on function public.award_case_drop(uuid,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.award_case_drop(uuid,text,double precision,double precision) to service_role;
revoke all on function public.cases_view(uuid) from public,anon,authenticated;
grant execute on function public.cases_view(uuid) to service_role;
revoke all on function public.open_pack_atomic(uuid,int) from public,anon,authenticated;
grant execute on function public.open_pack_atomic(uuid,int) to service_role;
notify pgrst,'reload schema';
