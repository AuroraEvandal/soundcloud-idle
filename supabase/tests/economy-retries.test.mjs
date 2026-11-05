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
  assert.equal(sold.coins_earned, 26)
  assert.deepEqual(await rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [other, recorded.beat.id, sellRequest]), sold)
  await assert.rejects(rpc('select release_recorded_beat_atomic($1,$2,$3) result', [other, recorded.beat.id, id()]), /BEAT_ALREADY_PROCESSED/)
  await assert.rejects(rpc('select sell_recorded_beat_atomic($1,$2,$3) result', [player, recorded.beat.id, id()]), /BEAT_NOT_FOUND/)
  await db.query('update players set energy=49,energy_updated_at=clock_timestamp() where id=$1',[other])
  await assert.rejects(rpc(sql,[other,id()]), /NO_ENERGY/)
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
