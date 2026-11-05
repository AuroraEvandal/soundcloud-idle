import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const player = '00000000-0000-4000-8000-000000000011'
const other = '00000000-0000-4000-8000-000000000012'
const id = () => crypto.randomUUID()
const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0].result
before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(await readFile(new URL('../../backend/schema.sql', import.meta.url), 'utf8'))
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
    if (file === '20261030190023_atomic_record_snippet.sql') {
      await db.query("insert into players(id,telegram_id,username) values ('00000000-0000-4000-8000-000000000013',13,'legacy')")
      await db.query(`insert into snippet_requests(player_id,request_id,response) values
        ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000014','{"released":[],"legacy":true}')`)
    }
  }
  await db.exec(await readFile(new URL('../migrations/20261104120000_pets_and_cases.sql',import.meta.url),'utf8'))
  await db.query('insert into players(id,telegram_id,username,coins) values ($1,11,\'test\',300),($2,12,\'other\',300)', [player, other])
  await db.query("insert into beats(id,name,base_streams,price) values (90,'test',150,0)")
})
after(() => db.close())

test('catalog, ownership validation, duplicate levels and maximum refund', async () => {
  assert.equal((await rpc('select pets_view($1) result', [player])).pets.length, 3)
  await assert.rejects(rpc("select equip_pet_atomic($1,'soundity') result", [player]), /NOT_OWNED/)
  for (let n = 1; n <= 4; n++) {
    const drop = await rpc("select award_case_drop($1,'free',0,0) result", [player])
    assert.equal(drop.level, Math.min(3, n))
    assert.equal(drop.duplicate, n > 1)
    assert.equal(drop.refund, n === 4 ? 300 : 0)
  }
  const pets = await rpc("select equip_pet_atomic($1,'soundity') result", [player])
  assert.equal(pets.income_pct, 3)
})

test('free cooldown and saved request are atomic and idempotent', async () => {
  const request = id()
  const first = await rpc("select open_free_case($1,$2) result", [other, request])
  assert.deepEqual(await rpc('select open_free_case($1,$2) result', [other, request]), first)
  await db.query('update players set coins=coins+17 where id=$1',[other])
  const replay = await rpc('select open_free_case($1,$2) result',[other,request])
  assert.deepEqual(replay.drop,first.drop)
  assert.equal(replay.player.coins,first.player.coins+17)
  await assert.rejects(rpc('select open_free_case($1,$2) result', [other, id()]), /CASE_COOLDOWN/)
  assert.equal((await db.query('select count(*)::int n from case_openings where player_id=$1', [other])).rows[0].n, 1)
})

test('release income and friendship are persisted once, cap and inactive pets respected', async () => {
  await db.query("update player_pets set friendship=19 where player_id=$1 and pet_id='soundity'", [player])
  await db.query('update players set energy=100,hype=19,selected_beat_id=90,popularity=0 where id=$1', [player])
  const request = id()
  const release = await rpc('select record_snippet_atomic($1,1,$2) result', [player,request])
  assert.deepEqual(await rpc('select record_snippet_atomic($1,1,$2) result', [player,request]),release)
  await assert.rejects(rpc('select record_snippet_atomic($1,2,$2) result',[player,request]), /IDEMPOTENCY_CONFLICT/)
  assert.equal(release.released[0].streams, 155)
  let pets = await rpc('select pets_view($1) result', [player])
  assert.equal(pets.pets[0].friendship, 20)
  assert.equal(pets.income_pct, 4)
  const event = (await db.query('select * from studio_releases where player_id=$1', [player])).rows[0]
  await db.query('insert into studio_releases(id,player_id) values ($1,$2) on conflict do nothing', [event.id, player])
  assert.equal((await rpc('select pets_view($1) result', [player])).pets[0].friendship, 20)
  await db.query("update player_pets set friendship=59 where player_id=$1", [player])
  const battle = id()
  await db.query('insert into battles(id,player_id,opponent_id) values($1,$2,1)', [battle, player])
  await db.query("update battles set status='finished' where id=$1", [battle])
  await db.query("update battles set status='finished' where id=$1", [battle])
  pets = await rpc('select pets_view($1) result', [player])
  assert.equal(pets.pets[0].friendship, 60)
  assert.equal(pets.income_pct, 5)
  await rpc('select equip_pet_atomic($1,null) result', [player])
  assert.equal((await rpc('select pets_view($1) result', [player])).income_pct, 0)
  // A viewer with an old snapshot must never restore energy spent by another request.
  await db.query('update players set energy=40,energy_updated_at=now() where id=$1',[player])
  await rpc('select record_snippet_atomic($1,10) result',[player])
  assert.equal((await rpc('select to_jsonb(refresh_studio_energy($1)) result',[player])).energy,30)
})

test('Stars order validates owner currency amount and charge; duplicate webhook never rerolls', async () => {
  const order = await rpc("select create_case_order($1,'underground',$2) result", [player, id()])
  for (const args of [[12,'XTR',29],[11,'USD',29],[11,'XTR',1]]) {
    await assert.rejects(rpc('select fulfill_case_order($1,$2,$3,$4,$5) result', [order.id,...args,'bad']), /INVALID_PAYMENT/)
  }
  const paid = await rpc('select fulfill_case_order($1,11,\'XTR\',29,$2) result', [order.id,'charge-1'])
  assert.equal(paid.status, 'paid')
  assert.deepEqual(await rpc('select fulfill_case_order($1,11,\'XTR\',29,$2) result', [order.id,'charge-1']), paid)
  await db.query('update players set coins=coins+19 where id=$1',[player])
  const current = await rpc('select case_result_view($1,$2::jsonb) result',[player,JSON.stringify(paid)])
  assert.deepEqual(current.drop,paid.drop)
  assert.equal(current.player.coins,paid.player.coins+19)
  const second = await rpc("select create_case_order($1,'underground',$2) result", [player,id()])
  await assert.rejects(rpc('select fulfill_case_order($1,11,\'XTR\',29,$2) result', [second.id,'charge-1']), /unique|INVALID_PAYMENT/)
})

test('all pet/payment mutators are inaccessible to browser roles', async () => {
  const functions = ['award_case_drop(uuid,text,double precision,double precision)','equip_pet_atomic(uuid,text)',
    'open_free_case(uuid,uuid)','create_case_order(uuid,text,uuid)','fulfill_case_order(uuid,bigint,text,integer,text)',
    'record_snippet_atomic(uuid,integer,uuid)','refresh_studio_energy(uuid)']
  for (const fn of functions) {
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).rows[0].allowed,false)
    }
  }
})

test('case odds boundaries and fallback rewards exactly match the catalog', async () => {
  for (const [caseId,below,boundary,coins] of [
    ['free',0.000499,0.0005,25],['underground',0.009999,0.01,150],['gift-vault',0.029999,0.03,600],
  ]) {
    const hit = await rpc('select award_case_drop($1,$2,$3,0.5) result',[other,caseId,below])
    assert.equal(hit.type,'pet')
    assert.equal(hit.pet_id,'micity')
    assert.deepEqual(await rpc('select award_case_drop($1,$2,$3,0.5) result',[other,caseId,boundary]),{type:'coins',coins})
  }
  const cases = await rpc('select cases_view($1) result',[other])
  assert.deepEqual(cases.cases.map(c => [c.price_stars,c.pet_chance,c.fallback_coins]),[
    [0,0.0005,25],[29,0.01,150],[100,0.03,600],
  ])
  await assert.rejects(rpc("select award_case_drop($1,'free',-1,0) result",[other]),/INVALID_REQUEST/)
})


test('merged recording RPC accepts named Edge Function arguments without overload ambiguity', async () => {
  await db.query('update players set energy=100,hype=0 where id=$1', [other])
  const request = id()
  const args = [other, request, 1]
  const sql = 'select record_snippet_atomic(p_player_id => $1::uuid, p_request_id => $2::uuid, p_taps => $3::int) result'
  const first = await rpc(sql, args)
  assert.equal(first.player.energy, 99)
  assert.deepEqual(await rpc(sql, args), first)
  await assert.rejects(rpc(sql, [other, request, 2]), /IDEMPOTENCY_CONFLICT/)
})


test('upgrading main preserves saved recording responses and replaying the repair is safe', async () => {
  const repair = await readFile(new URL('../migrations/20261105120000_merge_recording_compatibility.sql', import.meta.url), 'utf8')
  await db.exec(repair)
  await db.exec(repair)
  const legacy = await rpc(`select record_snippet_atomic(
    p_player_id => '00000000-0000-4000-8000-000000000013'::uuid,
    p_request_id => '00000000-0000-4000-8000-000000000014'::uuid,
    p_taps => 1) result`)
  assert.deepEqual(legacy, { released: [], legacy: true })
  assert.equal((await db.query("select to_regprocedure('record_snippet_atomic(uuid,uuid,int)') old")).rows[0].old, null)
})
