import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const player = '00000000-0000-4000-8000-000000000041'
const other = '00000000-0000-4000-8000-000000000042'
const id = () => crypto.randomUUID()
const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0].result
const balance = async (owner = player) => rpc('select coins result from players where id=$1', [owner])
const open = (request, pack = 91, owner = player) => rpc('select open_pack_idempotent($1,$2,$3) result', [owner, pack, request])

test('new Beat Lab styles persist and charge 50 energy exactly once; unknown styles do not charge', async () => {
  for (const genre of ['trap','plugg','cloud_rap']) {
    await db.query('update players set energy=100,energy_updated_at=clock_timestamp() where id=$1',[player])
    const request=id()
    const sql="select record_beat_atomic($1,$2,$3,140,0,'minor','{}',80,'{}') result"
    const first=await rpc(sql,[player,request,genre])
    assert.equal(first.beat.genre,genre)
    assert.equal(first.energy_cost,50)
    assert.equal(first.player.energy,50)
    assert.deepEqual(await rpc(sql,[player,request,genre]),first)
  }
  const energy=await rpc('select energy result from players where id=$1',[player])
  await assert.rejects(rpc("select record_beat_atomic($1,$2,'unknown',140,0,'minor','{}',80,'{}') result",[player,id()]),/INVALID_BEAT/)
  assert.equal(await rpc('select energy result from players where id=$1',[player]),energy)
})

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(await readFile(new URL('../../backend/schema.sql', import.meta.url), 'utf8'))
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(await readFile(new URL('../../backend/seed.sql', import.meta.url), 'utf8'))
  await db.query('insert into players(id,telegram_id,coins) values($1,41,10000),($2,42,10000)', [player, other])
  // Only card rewards: no random clothing branch in the assertions below.
  await db.query("insert into packs(id,name,price,clothing_chance) values(91,'retry-test',200,0),(92,'other',100,0)")
})
after(() => db.close())

test('a lost pack response can be replayed after the balance changes, without another charge', async () => {
  const request = id()
  const first = await open(request)
  assert.equal(await balance(), 9800)
  await db.query('update players set coins=coins+7 where id=$1', [player])
  assert.deepEqual(await open(request), first)
  assert.equal(await balance(), 9807)
  assert.equal(await rpc('select count(*)::int result from pack_requests where player_id=$1', [player]), 1)
  await assert.rejects(open(request, 92), /IDEMPOTENCY_CONFLICT/)
  assert.equal(await balance(), 9807)
  const another = await open(id())
  assert.notEqual(another.card_id, first.card_id)
  assert.equal(await balance(), 9607)
})

test('replaying a duplicate does not restore uses spent since the original opening', async () => {
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards on conflict do nothing', [player])
  const request = id()
  const before = await balance()
  const drop = await open(request)
  assert.equal(drop.duplicate, true)
  assert.equal(await balance(), before - 200 + drop.refund)
  await db.query('update player_cards set uses_left=2 where player_id=$1 and card_id=$2', [player, drop.card_id])
  assert.deepEqual(await open(request), drop)
  assert.equal(await rpc('select uses_left result from player_cards where player_id=$1 and card_id=$2', [player, drop.card_id]), 2)
  assert.equal(await balance(), before - 200 + drop.refund)
})

test('failed pack transactions leave no saved request or lost coins; IDs are scoped to the owner', async () => {
  const request = id()
  await db.query('update players set coins=0 where id=$1', [other])
  await assert.rejects(open(request, 91, other), /NOT_ENOUGH_COINS/)
  assert.equal(await balance(other), 0)
  assert.equal(await rpc('select count(*)::int result from pack_requests where player_id=$1', [other]), 0)
  await db.query('update players set coins=1000 where id=$1', [other])
  await open(request, 91, other)
  const before = await balance()
  const drop = await open(request)
  assert.equal(await balance(), before - 200 + drop.refund)
  assert.equal(await balance(other), 800)
})

test('new pack storage and RPC cannot be used by browser roles; the migration is safe to replay', async () => {
  await db.exec(await readFile(new URL('../migrations/20261105162840_idempotent_pack_opening.sql', import.meta.url), 'utf8'))
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await rpc("select has_function_privilege($1,'open_pack_idempotent(uuid,integer,uuid)','execute') result", [role]), false)
    assert.equal(await rpc("select has_table_privilege($1,'pack_requests','select') result", [role]), false)
  }
  assert.equal(await rpc("select has_function_privilege('service_role','open_pack_idempotent(uuid,integer,uuid)','execute') result"), true)
  assert.equal(await rpc("select relrowsecurity result from pg_class where oid='pack_requests'::regclass"), true)
})

test('Beatmaker shares energy with snippets and records/sells exactly once', async () => {
  await db.query('update players set energy=100,energy_updated_at=clock_timestamp(),selected_beat_id=1 where id=$1', [other])
  const request = id()
  const sql = "select record_beat_atomic($1,$2,'trap',140,0,'minor','{}',80,'{}') result"
  const recorded = await rpc(sql, [other, request])
  assert.equal(recorded.player.energy, 50)
  assert.equal(recorded.energy_cost, 50)
  assert.deepEqual(await rpc(sql, [other, request]), recorded)
  const snippet = await rpc('select record_snippet_atomic($1,10,$2) result', [other, id()])
  assert.equal(snippet.player.energy, 40)
  const sellRequest = id()
  const sold = await rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, recorded.beat.id, sellRequest])
  assert.equal(sold.coins_earned, 84)
  assert.deepEqual(await rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, recorded.beat.id, sellRequest]), sold)
  await assert.rejects(rpc('select release_recorded_beat_atomic($1,$2,$3) result', [other, recorded.beat.id, id()]), /BEAT_ALREADY_PROCESSED/)
  await assert.rejects(rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [player, recorded.beat.id, id()]), /BEAT_NOT_FOUND/)
  await db.query('update players set energy=49,energy_updated_at=clock_timestamp() where id=$1',[other])
  await assert.rejects(rpc(sql.replace('140','141'),[other,id()]), /NO_ENERGY/)
  assert.equal(await rpc('select energy result from players where id=$1',[other]),49)
})

test('Beatmaker collection keeps fractional coin progress between requests', async () => {
  const beat = await rpc(`insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown,status,stream_cap,streams_paid,released_at)
    values($1,'trap',140,0,'minor','{}',80,'{}','streaming',101,9,clock_timestamp()-interval '24 hours') returning id result`, [other])
  const request = id()
  const before = await balance(other)
  const result = await rpc('select collect_recorded_beat_atomic($1,$2,$3) result', [other, beat, request])
  assert.equal(result.streams_earned, 92)
  assert.equal(result.coins_earned, 10)
  assert.equal(await balance(other), before + 10)
  assert.deepEqual(await rpc('select collect_recorded_beat_atomic($1,$2,$3) result', [other, beat, request]), result)
  assert.equal((await rpc('select collect_recorded_beat_atomic($1,$2,$3) result', [other, beat, id()])).coins_earned, 0)
})

test('single-call studio returns the existing public shape and acknowledges each batch once', async () => {
  await db.query('update players set energy=100,energy_updated_at=clock_timestamp(),hype=19,selected_beat_id=1 where id=$1', [other])
  const before = await balance(other)
  const request = id()
  const first = await rpc('select record_snippet_by_telegram(42,1,$1) result', [request])
  assert.equal(first.studio.hype, 0)
  assert.equal(first.studio.energy, 99)
  assert.equal(first.released.length, 1)
  assert.equal(first.studio.beats.find(b => b.id === 1).owned, true)
  assert.ok(Array.isArray(first.studio.equipment))
  assert.equal(await balance(other), before + first.released[0].coins)
  assert.deepEqual(await rpc('select record_snippet_by_telegram(42,1,$1) result', [request]), first)
  await assert.rejects(rpc('select record_snippet_by_telegram(42,2,$1) result', [request]), /IDEMPOTENCY_CONFLICT/)
  const studio = await rpc('select get_studio_by_telegram(42) result')
  assert.equal(studio.studio.energy, 99)
  assert.equal(studio.player.coins, first.player.coins)
  await assert.rejects(rpc('select get_studio_by_telegram(-999) result'), /PLAYER_NOT_FOUND/)
  for (const role of ['anon','authenticated']) {
    for (const fn of ['studio_snapshot(players)','get_studio_by_telegram(bigint)','record_snippet_by_telegram(bigint,integer,uuid)']) {
      assert.equal(await rpc('select has_function_privilege($1,$2,\'execute\') result',[role,fn]), false)
    }
  }
})

test('pack rarity settings act on categories and prefer unowned cards within that rarity', async () => {
  for (const rarity of ['common','rare','epic']) {
    await db.query('update game_balance set common_weight=$1,rare_weight=$2,epic_weight=$3',
      [rarity==='common'?1:0,rarity==='rare'?1:0,rarity==='epic'?1:0])
    await db.query('delete from player_cards where player_id=$1',[other])
    await db.query('update players set coins=1000 where id=$1',[other])
    const first = await open(id(),91,other)
    assert.equal(await rpc('select rarity result from cards where id=$1',[first.card_id]),rarity)
    const second = await open(id(),91,other)
    assert.notEqual(second.card_id,first.card_id)
    assert.equal(second.duplicate,false)
  }
  await db.query('update game_balance set common_weight=70,rare_weight=24,epic_weight=6')
  for (const role of ['anon','authenticated']) {
    assert.equal(await rpc("select has_table_privilege($1,'game_balance','update') result",[role]),false)
  }
})

test('beat history paginates beyond 100 per owner, including equal creation timestamps', async () => {
  const owner=id()
  await db.query('insert into players(id,telegram_id) values($1,95)',[owner])
  await db.query(`insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown,created_at)
    select $1,'trap',140,0,'minor','{}',80,'{}','2026-11-05T12:00:00Z'::timestamptz from generate_series(1,105)`,[owner])
  const first=(await db.query('select id,created_at from player_recorded_beats where player_id=$1 order by created_at desc,id desc limit 100',[owner])).rows
  const last=first.at(-1)
  const rest=(await db.query('select id from player_recorded_beats where player_id=$1 and (created_at<$2 or (created_at=$2 and id<$3)) order by created_at desc,id desc limit 100',[owner,last.created_at,last.id])).rows
  assert.equal(first.length,100)
  assert.equal(rest.length,5)
  assert.equal(new Set([...first,...rest].map(b=>b.id)).size,105)
})


test('Beatmaker rewards quality with the shared fan multiplier and keeps release tiers', async () => {
  for (const fans of [0, 99, 100, 400, 1000, 4000, 10000]) {
    await db.query('update players set popularity=$2 where id=$1', [other, fans])
    for (const quality of [0, 70, 80, 100]) {
      const draft = () => rpc(`insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown)
        values($1,'trap',140,0,'minor','{}',$2,'{}') returning id result`, [other, quality])
      const before = await balance(other)
      const beat = await draft()
      const request = id()
      const sold = await rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, beat, request])
      const expected = Math.round((20 + Math.round(quality * 0.8)) * (1 + Math.floor(fans / 100) / 100))
      assert.equal(sold.coins_earned, expected)
      assert.equal(sold.beat.sale_coins, expected)
      assert.equal(await balance(other), before + expected)
      assert.deepEqual(await rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, beat, request]), sold)
      assert.equal(await balance(other), before + expected)
      await assert.rejects(rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, beat, id()]), /BEAT_ALREADY_PROCESSED/)
      const releaseId = id()
      const released = await rpc('select release_recorded_beat_atomic($1,$2,$3) result', [other, await draft(), releaseId])
      assert.equal(released.max_streams, Math.round((200 + quality * 10) * (1 + Math.floor(fans / 100) / 100) * 2 ** released.viral_tier))
      assert.equal(released.duration_hours, 24)
      assert.ok(released.viral_tier >= 0 && released.viral_tier <= released.max_tier)
      assert.deepEqual(await rpc('select release_recorded_beat_atomic($1,$2,$3) result', [other, released.beat.id, releaseId]), released)
      await db.query("update player_recorded_beats set released_at=clock_timestamp()-interval '24 hours' where id=$1", [released.beat.id])
      const collected = await rpc('select collect_recorded_beat_atomic($1,$2,$3) result', [other, released.beat.id, id()])
      assert.equal(collected.coins_earned, Math.floor(released.max_streams / 10))
    }
  }
  for (const fn of ['sell_recorded_beat_atomic(uuid,uuid,uuid)', 'release_recorded_beat_atomic(uuid,uuid,uuid)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal(await rpc("select has_function_privilege($1,$2,'execute') result", [role, fn]), false)
    }
    assert.equal(await rpc("select has_function_privilege('service_role',$1,'execute') result", [fn]), true)
  }
})


test('all coin sources use full hundreds of fans, with no former 400-fan cap', async () => {
  const owner=id()
  await db.query('insert into players(id,telegram_id,coins,selected_beat_id) values($1,96,10000,1)',[owner])
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards',[owner])
  await db.query("insert into player_pets(player_id,pet_id,level) values($1,'soundity',3)",[owner])
  for (const fans of [0,99,100,199,200,999,1000,10000]) {
    const multiplier=1+Math.floor(fans/100)/100
    await db.query('update players set popularity=$2,energy=100,energy_updated_at=clock_timestamp(),hype=0 where id=$1',[owner,fans])
    assert.equal(Number(await rpc('select fan_income_multiplier($1) result',[fans])),multiplier)
    const snippetRequest=id()
    const snippet=await rpc('select record_snippet_atomic($1,20,$2) result',[owner,snippetRequest])
    assert.equal(snippet.released[0].streams,150)
    assert.equal(snippet.released[0].coins,Math.round(15*multiplier))
    await db.query('update players set popularity=$2 where id=$1',[owner,fans])
    const cases=await rpc('select cases_view($1) result',[owner])
    for (const [caseId,base] of [['free',25],['underground',150],['gift-vault',600]]) {
      const drop=await rpc('select award_case_drop($1,$2,0.99,0) result',[owner,caseId])
      assert.equal(drop.coins,Math.round(base*multiplier))
      assert.equal(cases.cases.find(c=>c.id===caseId).fallback_coins,drop.coins)
    }
    const pet=await rpc("select award_case_drop($1,'free',0,0) result",[owner])
    assert.equal(pet.refund,Math.round(300*multiplier))
    const pack=await open(id(),91,owner)
    const rarity=await rpc('select rarity result from cards where id=$1',[pack.card_id])
    assert.equal(pack.refund,Math.round(({common:20,rare:60,epic:150}[rarity])*multiplier))
    await db.query('update player_cards set uses_left=3 where player_id=$1',[owner])
    // Seed the state immediately before a deciding win; round 1 needs no mini-game.
    const battle=await rpc(`insert into battles(player_id,opponent_id,current_round,player_rounds_won,themes,current_hand)
      values($1,1,1,1,array['деньги'],array[140,141,143,142]) returning id result`,[owner])
    const side={lines:['a','b','c','d'],scores:{rhyme:7,flow:7,punch:7,meaning:7},points:70}
    const data={round:{number:1,theme:'деньги',player:side,opponent:{...side,points:60},winner:'player'}}
    const request=id()
    const args=[owner,battle,request,JSON.stringify(data)]
    const query='select submit_round_atomic($1,$2,1,$3,array[140,141,143,142],$4::jsonb) result'
    const won=await rpc(query,args)
    assert.equal(won.rewards.coins_change,Math.round(50*multiplier))
    const after=await balance(owner)
    await db.query('update players set popularity=20000 where id=$1',[owner])
    assert.deepEqual(await rpc(query,args),won)
    assert.deepEqual(await rpc('select record_snippet_atomic($1,20,$2) result',[owner,snippetRequest]),snippet)
    assert.equal(await balance(owner),after)
  }
  for (const fn of ['fan_income_multiplier(integer)','fan_income_coins(numeric,integer)']) {
    for (const role of ['anon','authenticated']) assert.equal(await rpc("select has_function_privilege($1,$2,'execute') result",[role,fn]),false)
  }
})


test('identical beats cannot be recorded again, renamed or reordered, across the full history', async () => {
  const owner=id(), second=id()
  await db.query('insert into players(id,telegram_id) values($1,991),($2,992)',[owner,second])
  const pattern={drums:{kick:[16,0],snare:[12,4],hihat:[8,0]},piano:[{step:16,note:12},{step:0,note:15}],melody:[]}
  const sql="select record_beat_atomic($1,$2,'trap',140,0,'minor',$3,80,'{}',$4) result"
  const request=id()
  const first=await rpc(sql,[owner,request,pattern,'  Ночной район  '])
  assert.equal(first.beat.name,'Ночной район')
  assert.deepEqual(await rpc(sql,[owner,request,pattern,'Ночной район']),first)
  await assert.rejects(rpc(sql,[owner,request,pattern,'Другое имя']),/IDEMPOTENCY_CONFLICT/)
  const reordered=structuredClone(pattern)
  for(const lane of Object.values(reordered.drums)) lane.reverse()
  reordered.piano.reverse()
  for(const status of ['draft','sold','streaming','complete']) {
    await db.query('update player_recorded_beats set status=$2 where id=$1',[first.beat.id,status])
    await assert.rejects(rpc(sql,[owner,id(),reordered,'Новое имя']),/DUPLICATE_BEAT/)
  }
  assert.equal(await rpc('select energy result from players where id=$1',[owner]),50)
  assert.equal(await rpc('select count(*)::int result from player_recorded_beats where player_id=$1',[owner]),1)
  assert.equal(await rpc('select count(*)::int result from beatmaker_requests where player_id=$1',[owner]),1)
  assert.equal((await rpc(sql,[second,id(),pattern,''])).beat.name,'Без названия')
  const changed=structuredClone(pattern);changed.piano[0].note=14
  assert.ok((await rpc(sql,[owner,id(),changed,null])).beat.id)
  await assert.rejects(rpc(sql,[owner,id(),pattern,'x'.repeat(61)]),/INVALID_BEAT_NAME/)
  for(const role of ['anon','authenticated']) assert.equal(await rpc("select has_function_privilege($1,'record_beat_atomic(uuid,uuid,text,integer,integer,text,jsonb,integer,jsonb,text)','execute') result",[role]),false)
})


test('pre-update recordings and saved responses survive the migration', async () => {
  const owner=id(), request=id()
  await db.query('insert into players(id,telegram_id) values($1,993)',[owner])
  const pattern={drums:{kick:[16,0],snare:[12,4],hihat:[8,0]},piano:[{step:16,note:12},{step:0,note:15}],melody:[]}
  // Direct insertion models an old recording, without passing through the new RPC.
  const beat=await rpc("insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown,status) values($1,'trap',140,0,'minor',$2,80,'{}','sold') returning id result",[owner,pattern])
  const payload={genre:'trap',bpm:140,key:0,scale:'minor',pattern}
  const response={beat:{id:beat},energy_cost:50}
  await db.query("insert into beatmaker_requests(player_id,request_id,action,payload,response) values($1,$2,'record',$3,$4)",[owner,request,payload,response])
  const sql="select record_beat_atomic($1,$2,'trap',140,0,'minor',$3,80,'{}') result"
  assert.deepEqual(await rpc(sql,[owner,request,pattern]),response)
  pattern.piano.reverse();pattern.drums.kick.reverse()
  await assert.rejects(rpc(sql,[owner,id(),pattern]),/DUPLICATE_BEAT/)
  assert.equal(await rpc('select energy result from players where id=$1',[owner]),100)
  assert.equal(await rpc('select name result from player_recorded_beats where id=$1',[beat]),'Без названия')
})


test('premium pack costs 500, retries once, and a poor player keeps coins and inventory', async () => {
  await db.exec('begin');
  try {
    await db.query('update packs set clothing_chance=0 where id=2');
    await db.query('update players set coins=500 where id=$1',[other]);
    await db.query('delete from player_cards where player_id=$1',[other]);
    const request=id();
    const drop=await open(request,2,other);
    assert.equal(drop.duplicate,false);
    assert.equal(await balance(other),0);
    assert.deepEqual(await open(request,2,other),drop);
    await db.exec('savepoint insufficient_coins');
    await assert.rejects(open(id(),2,other),/NOT_ENOUGH_COINS/);
    await db.exec('rollback to savepoint insufficient_coins');
    assert.equal(await balance(other),0);
    assert.equal(await rpc('select count(*)::int result from player_cards where player_id=$1',[other]),1);
    await db.exec('savepoint conflicting_pack');
    await assert.rejects(open(request,1,other),/IDEMPOTENCY_CONFLICT/);
    await db.exec('rollback to savepoint conflicting_pack');
  } finally { await db.exec('rollback'); }
});

test('premium weights produce 40/40/20 independently of global settings; basic still uses global weights', async () => {
  await db.exec('begin');
  try {
    const {rows}=await db.query('select id,price,common_weight,rare_weight,epic_weight from packs where id in (1,2) order by id');
    assert.deepEqual(rows.map(r=>[r.id,r.price,...[r.common_weight,r.rare_weight,r.epic_weight].map(v=>v===null?null:Number(v))]),[[1,200,null,null,null],[2,500,40,40,20]]);
    await db.query('update packs set clothing_chance=0 where id in (1,2)');
    await db.query('update game_balance set common_weight=100,rare_weight=0,epic_weight=0');
    await db.query('update players set coins=2000000 where id=$1',[other]);
    await db.exec('select setseed(0.42)');
    const counts={common:0,rare:0,epic:0};
    for(let i=0;i<1200;i++) {
      const drop=await open(id(),2,other);
      const rarity=await rpc('select rarity result from cards where id=$1',[drop.card_id]);
      counts[rarity]++;
    }
    for(const [r,chance] of Object.entries({common:0.4,rare:0.4,epic:0.2})) {
      assert.ok(Math.abs(counts[r]/1200-chance)<0.05,JSON.stringify(counts));
    }
    const basic=await open(id(),1,other);
    assert.equal(await rpc('select rarity result from cards where id=$1',[basic.card_id]),'common');
    for(const set of ['common_weight=-1','common_weight=0,rare_weight=0,epic_weight=0','epic_weight=null']) {
      await db.exec('savepoint invalid_weights');
      await assert.rejects(db.exec('update packs set '+set+' where id=2'),/packs_rarity_weights_check/);
      await db.exec('rollback to savepoint invalid_weights');
    }
  } finally { await db.exec('rollback'); }
});


test('each category pack charges 200 and draws only its slot across all rarities, with stable retries and duplicate refunds', async () => {
  await db.exec('begin');
  try {
    for (const [pack,slot] of [[3,'setup'],[4,'development'],[5,'boost'],[6,'punch']]) {
      assert.equal(await rpc('select price result from packs where id=$1',[pack]),200);
      assert.equal(Number(await rpc('select clothing_chance result from packs where id=$1',[pack])),0);
      for (const rarity of ['common','rare','epic']) {
        await db.query('update game_balance set common_weight=$1,rare_weight=$2,epic_weight=$3',
          [rarity==='common'?1:0,rarity==='rare'?1:0,rarity==='epic'?1:0]);
        await db.query('delete from player_cards where player_id=$1',[other]);
        await db.query('update players set coins=200,popularity=1000 where id=$1',[other]);
        const request=id();
        const drop=await open(request,pack,other);
        assert.equal(drop.type,'card');
        assert.equal(drop.duplicate,false);
        assert.deepEqual((await db.query('select slot,rarity from cards where id=$1',[drop.card_id])).rows[0],{slot,rarity});
        assert.equal(await balance(other),0);
        assert.deepEqual(await open(request,pack,other),drop);
        assert.equal(await balance(other),0);
        await db.query('insert into player_cards(player_id,card_id,uses_left) select $1,id,0 from cards where slot=$2 on conflict(player_id,card_id) do update set uses_left=0',[other,slot]);
        await db.query('update players set coins=200 where id=$1',[other]);
        const dup=await open(id(),pack,other);
        assert.equal(dup.duplicate,true);
        assert.equal(dup.refund,Math.round(({common:20,rare:60,epic:150}[rarity])*1.1));
        assert.equal(await balance(other),dup.refund);
        assert.equal(await rpc('select uses_left result from player_cards where player_id=$1 and card_id=$2',[other,dup.card_id]),3);
      }
    }
  } finally { await db.exec('rollback'); }
});

test('slot pack weights exclude unavailable rarities and an empty slot rolls back its charge', async () => {
  await db.exec('begin');
  try {
    await db.query('update players set coins=1000 where id=$1',[other]);
    await db.query("update cards set slot='boost' where slot='setup' and rarity='epic'");
    await db.query('update game_balance set common_weight=1,rare_weight=0,epic_weight=1000000');
    const drop=await open(id(),3,other);
    assert.deepEqual((await db.query('select slot,rarity from cards where id=$1',[drop.card_id])).rows[0],{slot:'setup',rarity:'common'});
    await db.query("update cards set slot='boost' where slot='setup'");
    const coins=await balance(other);
    const request=id();
    await db.exec('savepoint empty_slot');
    await assert.rejects(open(request,3,other),/ITEM_NOT_FOUND/);
    await db.exec('rollback to savepoint empty_slot');
    assert.equal(await balance(other),coins);
    assert.equal(await rpc('select count(*)::int result from pack_requests where player_id=$1 and request_id=$2',[other,request]),0);
    for (const change of ["card_slot='unknown'",'clothing_chance=0.07']) {
      await db.exec('savepoint invalid_slot');
      await assert.rejects(db.exec('update packs set '+change+' where id=3'),/packs_(card_slot|slot_clothing)_check/);
      await db.exec('rollback to savepoint invalid_slot');
    }
  } finally { await db.exec('rollback'); }
});
