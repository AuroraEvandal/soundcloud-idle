import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { opponentVerse } from '../functions/_shared/opponentVerses.js'

const db = new PGlite()
const player = '00000000-0000-4000-8000-000000000071'
const catalog = new URL('../migrations/20261107090108_complete_opponent_catalog.sql', import.meta.url)

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(await readFile(new URL('../../backend/schema.sql', import.meta.url), 'utf8'))
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(await readFile(new URL('../../backend/seed.sql', import.meta.url), 'utf8'))
  await db.query('insert into players(id,telegram_id,coins) values($1,71,321)', [player])
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards', [player])
})

after(() => db.close())

test('fans alone, a loss, a draw, an active win and another player win do not unlock the next opponent', async () => {
  const newcomer = '00000000-0000-4000-8000-000000000072'
  await db.query('insert into players(id,telegram_id,popularity) values($1,72,1000)', [newcomer])
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards', [newcomer])
  const unlocks = async () => (await db.query('select * from opponent_unlocks($1)', [newcomer])).rows
  assert.deepEqual(await unlocks(), [1, 2, 3, 4, 5].map(id => ({ opponent_id: id, unlocked: id === 1 })))
  for (const id of [2, 3, 4, 5]) {
    await assert.rejects(db.query('select create_battle_atomic($1,$2,$3)',
      [newcomer, id, crypto.randomUUID()]), /OPPONENT_LOCKED/)
  }
  const otherWin = (await db.query(`insert into battles(player_id,opponent_id,status,result)
    values($1,1,'finished','win') returning id`, [player])).rows[0].id
  assert.equal((await unlocks())[1].unlocked, false)
  await db.query('delete from battles where id=$1', [otherWin])
  for (const result of ['lose', 'draw']) {
    await db.query(`insert into battles(player_id,opponent_id,status,result) values($1,1,'finished',$2)`, [newcomer, result])
    assert.equal((await unlocks())[1].unlocked, false)
    await assert.rejects(db.query('select create_battle_atomic($1,2,$2)',
      [newcomer, crypto.randomUUID()]), /OPPONENT_LOCKED/)
  }
  const request = crypto.randomUUID()
  const battle = (await db.query('select create_battle_atomic($1,1,$2) id', [newcomer, request])).rows[0].id
  await db.query("update battles set result='win' where id=$1", [battle])
  assert.equal((await unlocks())[1].unlocked, false)
  await db.query("update battles set status='finished' where id=$1", [battle])
  assert.equal((await unlocks())[1].unlocked, true)
  assert.equal((await unlocks())[2].unlocked, false)
  await db.query(`insert into battles(player_id,opponent_id,status,result) values($1,1,'finished','lose')`, [newcomer])
  assert.equal((await unlocks())[1].unlocked, true)
  await db.query('update players set popularity=29 where id=$1', [newcomer])
  assert.equal((await unlocks())[1].unlocked, false)
  await assert.rejects(db.query('select create_battle_atomic($1,2,$2)',
    [newcomer, crypto.randomUUID()]), /OPPONENT_LOCKED/)
  // Replaying an old request still returns the original battle.
  assert.equal((await db.query('select create_battle_atomic($1,1,$2) id', [newcomer, request])).rows[0].id, battle)
  await db.query('update players set popularity=30 where id=$1', [newcomer])
  const nextRequest = crypto.randomUUID()
  const next = (await db.query('select create_battle_atomic($1,2,$2) id', [newcomer, nextRequest])).rows[0].id
  assert.equal((await db.query('select create_battle_atomic($1,2,$2) id', [newcomer, crypto.randomUUID()])).rows[0].id, next)
  await db.query('delete from players where id=$1', [newcomer])
})

test('all five opponents are present and the real battle RPC enforces each fan threshold', async () => {
  const { rows } = await db.query(`select o.id,o.level,l.name,l.required_popularity
    from opponents o join locations l on l.id=o.location_id order by o.id`)
  assert.deepEqual(rows, [
    { id: 1, level: 1, name: 'Двор', required_popularity: 0 },
    { id: 2, level: 2, name: 'Двор', required_popularity: 30 },
    { id: 3, level: 3, name: 'Клуб', required_popularity: 100 },
    { id: 4, level: 4, name: 'Клуб', required_popularity: 200 },
    { id: 5, level: 5, name: 'Фестиваль', required_popularity: 400 },
  ])
  for (const [opponent, required] of [[1, 0], [2, 30], [3, 100], [4, 200], [5, 400]]) {
    await db.query('update players set popularity=$2 where id=$1', [player, Math.max(0, required - 1)])
    if (required) await assert.rejects(
      db.query('select create_battle_atomic($1,$2,$3)', [player, opponent, crypto.randomUUID()]), /OPPONENT_LOCKED/)
    await db.query('update players set popularity=$2 where id=$1', [player, required])
    const started = await db.query('select create_battle_atomic($1,$2,$3) id', [player, opponent, crypto.randomUUID()])
    const battleId = started.rows[0].id
    assert.equal((await db.query('select opponent_id from battles where id=$1', [battleId])).rows[0].opponent_id, opponent)
    await db.query("update battles set status='finished',result='win' where id=$1", [battleId])
  }
})

test('a guest verse and its independent scores survive persistence and request replay', async () => {
  const battleId = (await db.query('select create_battle_atomic($1,5,$2) id', [player, crypto.randomUUID()])).rows[0].id
  const cards = (await db.query(`select distinct on(c.slot) c.id,c.slot from cards c
    join battles b on c.id=any(b.current_hand) where b.id=$1 order by c.slot,c.id`, [battleId])).rows
  const cardIds = ['setup', 'development', 'boost', 'punch'].map(slot => cards.find(c => c.slot === slot).id)
  const scores = { rhyme: 7, flow: 8, punch: 6, meaning: 9 }
  const opponent = { lines: opponentVerse(5, battleId, 1), scores, points: 73 }
  const round = { round: { number: 1, theme: 'улица',
    player: { lines: ['a', 'b', 'c', 'd'], scores, points: 90 }, opponent, winner: 'player' } }
  const request = crypto.randomUUID()
  const submit = (data) => db.query('select submit_round_atomic($1,$2,1,$3,$4,$5) result', [player, battleId, request, cardIds, data])
  const first = (await submit(round)).rows[0].result
  assert.deepEqual(first.round.opponent, opponent)
  assert.deepEqual((await submit({})).rows[0].result, first)
  assert.deepEqual((await db.query('select result_payload from rounds where battle_id=$1', [battleId])).rows[0].result_payload, first)
})

test('replaying the catalog keeps existing opponents, players and battle history', async () => {
  await db.query("update opponents set style='custom style' where id=1")
  const snapshot = async () => (await db.query(`select jsonb_build_object(
    'players',(select jsonb_agg(p) from players p),
    'battles',(select jsonb_agg(b order by b.id) from battles b),
    'opponents',(select jsonb_agg(o order by o.id) from opponents o),
    'locations',(select jsonb_agg(l order by l.id) from locations l)) state`)).rows[0].state
  const before = await snapshot()
  await db.exec(await readFile(catalog, 'utf8'))
  await db.exec(await readFile(catalog, 'utf8'))
  assert.deepEqual(await snapshot(), before)
  assert.equal((await db.query('select is_boss from opponents where id=5')).rows[0]?.is_boss, true)
})

test('unlock migration preserves wins on replay and its RPCs are server-only', async () => {
  const state = async () => (await db.query('select * from opponent_unlocks($1)', [player])).rows
  const before = await state()
  await db.exec(await readFile(new URL('../migrations/20261107163027_require_previous_opponent_win.sql', import.meta.url), 'utf8'))
  assert.deepEqual(await state(), before)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.query('select * from opponent_unlocks($1)', [player]), /permission denied/)
      await assert.rejects(db.query('select create_battle_atomic($1,1,$2)', [player, crypto.randomUUID()]), /permission denied/)
    } finally {
      await db.exec('reset role')
    }
  }
})
