import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = () => crypto.randomUUID()
const rpc = async (sql, args=[]) => (await db.query(sql,args)).rows[0].result
const state = owner => rpc('select to_jsonb(p) result from players p where id=$1',[owner])
const migration = new URL('../migrations/20261114135926_turn_based_days.sql',import.meta.url)
let telegram=10000, legacy, legacyBeat
async function player(coins=300) {
  const owner=id()
  await db.query('insert into players(id,telegram_id,coins,selected_beat_id) values($1,$2,$3,1)',[owner,++telegram,coins])
  return owner
}
const end = async (owner, request=id(), day, run) => {
  const p=await state(owner)
  return rpc('select end_game_day($1,$2,$3,$4) result',[owner,day??p.game_day,run??p.game_run,request])
}
const draft = owner => rpc(`insert into player_recorded_beats(player_id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown)
  values($1,'trap',140,0,'minor','{}',80,'{}') returning id result`,[owner])
const release = (owner,beat,request=id()) => rpc('select release_recorded_beat_atomic($1,$2,$3) result',[owner,beat,request])
const drink = (owner,request=id(),item='energy_drink') => rpc('select buy_consumable_atomic($1,$2,$3) result',[owner,item,request])

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  await db.exec(await readFile(new URL('../../backend/schema.sql',import.meta.url),'utf8'))
  for (const file of (await readdir(new URL('../migrations/',import.meta.url))).sort()) {
    if (!file.endsWith('_turn_based_days.sql')) await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  }
  await db.exec(await readFile(new URL('../../backend/seed.sql',import.meta.url),'utf8'))
  legacy=await player(321)
  legacyBeat=await draft(legacy)
  await db.query("update players set energy=37,popularity=777 where id=$1",[legacy])
  await db.query("update player_recorded_beats set status='streaming',stream_cap=101,streams_paid=9,released_at=clock_timestamp() where id=$1",[legacyBeat])
  await db.exec(await readFile(migration,'utf8'))
})
after(()=>db.close())

test('upgrade settles all old streams once and preserves existing money, fans and energy',async()=>{
  let p=await state(legacy)
  assert.equal(p.coins,331); assert.equal(p.streams,92); assert.equal(p.energy,37); assert.equal(p.popularity,777)
  assert.equal(await rpc('select status result from player_recorded_beats where id=$1',[legacyBeat]),'complete')
  await db.exec(await readFile(migration,'utf8'))
  assert.deepEqual(await state(legacy),p)
})

test('real time grants no energy; night adds 70..100 up to 100, keeps overflow and retries exactly once',async()=>{
  const owner=await player()
  await db.query("update players set energy=0,energy_updated_at=clock_timestamp()-interval '1 year' where id=$1",[owner])
  assert.equal((await rpc('select to_jsonb(refresh_studio_energy($1)) result',[owner])).energy,0)
  const request=id(), first=await end(owner,request)
  assert.ok(first.report.energy_roll>=70&&first.report.energy_roll<=100)
  assert.equal(first.player.energy,first.report.energy_roll)
  assert.equal(first.player.game_day,2)
  assert.equal(first.report.debt_due,0)
  const replay=await end(owner,request,1,1)
  assert.equal(replay.replayed,true); assert.deepEqual(replay.report,first.report)
  assert.equal(replay.player.game_day,2)
  await assert.rejects(end(owner,id(),1,1),/DAY_CHANGED/)
  await assert.rejects(end(owner,request,2,1),/IDEMPOTENCY_CONFLICT/)
  assert.equal((await end(owner)).player.energy,100)
  await db.query('update players set energy=170 where id=$1',[owner])
  assert.equal((await end(owner)).player.energy,170)
})

test('energy drink costs 100, overflows by 50, is atomic and cannot charge twice',async()=>{
  const owner=await player(), request=id()
  assert.equal((await drink(owner,request)).player.energy,150)
  assert.equal((await drink(owner,request)).player.coins,200)
  await assert.rejects(drink(owner,request,'other'),/IDEMPOTENCY_CONFLICT/)
  await assert.rejects(drink(owner,id(),'other'),/ITEM_NOT_FOUND/)
  await db.query('update players set coins=99 where id=$1',[owner])
  await assert.rejects(drink(owner),/NOT_ENOUGH_COINS/)
  assert.equal((await state(owner)).energy,150)
})

test('debt starts on night three; ten principal payments finish the finite debt',async()=>{
  const owner=await player(2000)
  assert.equal((await end(owner)).report.debt_due,0)
  assert.equal((await end(owner)).report.debt_due,0)
  for(let payment=1;payment<=10;payment++) {
    const result=await end(owner)
    assert.equal(result.report.debt_paid,100)
    assert.equal(result.player.debt_remaining,1000-payment*100)
  }
  assert.equal((await end(owner)).report.debt_due,0)
  assert.equal((await state(owner)).coins,1000)
})

test('insufficient balances remain untouched; 100→250→475 and payment clears misses but not fines from principal',async()=>{
  const owner=await player(99)
  await db.query('update players set game_day=3 where id=$1',[owner])
  let result=await end(owner)
  assert.equal(result.report.debt_due,100); assert.equal(result.player.coins,99); assert.equal(result.player.debt_overdue,150)
  result=await end(owner)
  assert.equal(result.report.debt_due,250); assert.equal(result.player.coins,99); assert.equal(result.player.debt_overdue,375)
  await db.query('update players set coins=500 where id=$1',[owner])
  result=await end(owner)
  assert.equal(result.report.debt_due,475); assert.equal(result.player.coins,25)
  assert.equal(result.player.debt_remaining,700); assert.equal(result.player.debt_misses,0)
  result=await end(owner)
  assert.equal(result.report.missed_payments,1); assert.equal(result.report.reset,false)
})

test('third failure resets the run and free progress, preserves paid pets, receipts and payment delivery',async()=>{
  const owner=await player(0)
  await db.query("update players set game_day=3,popularity=1000,xp=50,level=3,active_pet_id='soundity' where id=$1",[owner])
  await db.query("insert into player_pets values($1,'soundity',3,60),($1,'micity',1,20)",[owner])
  await db.query('insert into player_cards(player_id,card_id,uses_left) select $1,id,1 from cards',[owner])
  await db.query('insert into player_equipment select $1,id,clock_timestamp() from equipment',[owner])
  await draft(owner)
  await db.query(`insert into case_orders(player_id,telegram_id,request_id,case_id,price_stars,status,charge_id,response)
    select $1,telegram_id,$2,'underground',29,'paid','test-paid',
      '{"drop":{"type":"pet","pet_id":"soundity","level":1,"refund":0}}'::jsonb from players where id=$1`,[owner,id()])
  await end(owner); await end(owner)
  const request=id(), result=await end(owner,request)
  assert.equal(result.report.debt_due,475); assert.equal(result.report.reset,true)
  assert.equal(result.player.game_run,2); assert.equal(result.player.game_day,1)
  assert.equal(result.player.coins,300); assert.equal(result.player.energy,100); assert.equal(result.player.popularity,0)
  assert.equal(result.player.level,1); assert.equal(result.player.debt_remaining,1000)
  assert.equal(await rpc('select count(*)::int result from player_equipment where player_id=$1',[owner]),0)
  assert.equal(await rpc('select count(*)::int result from player_recorded_beats where player_id=$1',[owner]),0)
  assert.equal(await rpc('select count(*)::int result from player_cards where player_id=$1',[owner]),19)
  const pets=(await db.query('select pet_id,level,friendship from player_pets where player_id=$1',[owner])).rows
  assert.deepEqual(pets,[{pet_id:'soundity',level:1,friendship:0}])
  assert.equal(await rpc("select count(*)::int result from case_orders where player_id=$1 and status='paid'",[owner]),1)
  assert.equal((await end(owner,request,5,1)).player.game_run,2)
  await assert.rejects(end(owner,id(),5,1),/DAY_CHANGED/)
})

test('three independent beat draws pay immediately then once each new day; collection and retries cannot add a fourth',async()=>{
  const owner=await player(), beat=await draft(owner), request=id()
  const first=await release(owner,beat,request)
  assert.equal(first.duration_days,3); assert.equal(first.installment,1)
  assert.equal(first.player.coins,300+first.coins_earned)
  assert.equal(first.beat.installments_paid,1)
  assert.deepEqual(await release(owner,beat,request),first)
  const second=await end(owner)
  assert.equal(second.report.releases[0].installment,2)
  const third=await end(owner)
  assert.equal(third.report.releases[0].installment,3)
  const b=await rpc('select to_jsonb(b) result from player_recorded_beats b where id=$1',[beat])
  assert.equal(b.status,'complete'); assert.equal(b.daily_payouts.length,3)
  let streams=0
  for(const payout of b.daily_payouts) {
    assert.equal(payout.streams,1000*2**payout.viral_tier)
    streams+=payout.streams
  }
  assert.equal(b.stream_cap,streams); assert.equal(b.streams_paid,streams)
  assert.equal((await state(owner)).coins,300+Math.floor(streams/10))
  assert.equal((await rpc('select collect_recorded_beat_atomic($1,$2,$3) result',[owner,beat,id()])).coins_earned,0)
  assert.equal((await end(owner)).report.releases.length,0)
})

test('activity admission spends 80 exactly once and blocks day changes until completion',async()=>{
  const owner=await player()
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards',[owner])
  const request=id(), battle=await rpc('select create_battle_atomic($1,1,$2) result',[owner,request])
  assert.equal((await state(owner)).energy,20)
  assert.equal(await rpc('select create_battle_atomic($1,1,$2) result',[owner,request]),battle)
  assert.equal(await rpc('select create_battle_atomic($1,1,$2) result',[owner,id()]),battle)
  await assert.rejects(end(owner),/ACTIVITY_IN_PROGRESS/)
  assert.equal((await state(owner)).game_day,1)
  await db.query("update battles set status='finished',result='win' where id=$1",[battle])
  await assert.rejects(rpc("select concert_action($1,'start','{\"episodeId\":0,\"choiceId\":\"artist\"}',$2) result",[owner,id()]),/NO_ENERGY/)
  await db.query('update players set energy=100 where id=$1',[owner])
  const concertId=id(), sql="select concert_action($1,'start','{\"episodeId\":0,\"choiceId\":\"artist\"}',$2) result"
  const show=await rpc(sql,[owner,concertId])
  await rpc(sql,[owner,concertId]); assert.equal((await state(owner)).energy,20)
  await assert.rejects(end(owner),/ACTIVITY_IN_PROGRESS/)
  await rpc("select concert_action($1,'abandon',$2,$3) result",[owner,{showId:show.show.id},id()])
  assert.equal((await end(owner)).player.game_day,2)
})

test('night credits streaming before charging debt; server functions and tables are inaccessible to browser roles',async()=>{
  const owner=await player(0), beat=await draft(owner)
  await db.query('update players set game_day=2 where id=$1',[owner])
  await release(owner,beat)
  await end(owner)
  await db.query('update players set coins=0 where id=$1',[owner])
  const paid=await end(owner)
  assert.ok(paid.report.coins_earned>=100)
  assert.equal(paid.report.debt_paid,100)
  for(const role of ['anon','authenticated']) {
    for(const table of ['day_requests','consumable_requests']) {
      assert.equal(await rpc("select has_table_privilege($1,$2,'select') result",[role,table]),false)
      assert.equal(await rpc('select relrowsecurity result from pg_class where oid=$1::regclass',[table]),true)
    }
    for(const fn of ['end_game_day(uuid,integer,integer,uuid)','buy_consumable_atomic(uuid,text,uuid)',
      'reset_game_run(uuid)','pay_daily_beat(uuid,uuid)','roll_daily_streams(integer,integer)']) {
      assert.equal(await rpc("select has_function_privilege($1,$2,'execute') result",[role,fn]),false)
    }
  }
  await db.query('update players set coins=1000 where id=$1',[owner])
  await db.exec('set role service_role')
  try { assert.equal((await end(owner)).player.id,owner); await drink(owner) }
  finally { await db.exec('reset role') }
})
