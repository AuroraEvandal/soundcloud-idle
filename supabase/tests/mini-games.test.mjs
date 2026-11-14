import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { timingPosition } from '../../frontend/frontend/src/timingGame.js'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const playerId = '00000000-0000-4000-8000-000000000001'
const strangerId = '00000000-0000-4000-8000-000000000002'
const migration = new URL('../migrations/20261102120000_inter_round_mini_games.sql', import.meta.url)
const seed = (kind = 'timing') => ({ kind, prompt: 'Мой новый трек залетает в…', options: [
  { id: 'a', text: 'чарты' }, { id: 'b', text: 'тапки' }, { id: 'c', text: 'чайник' },
], answer_id: 'a' })

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(await readFile(new URL('../../backend/schema.sql', import.meta.url), 'utf8'))
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    if (file < '20261102') await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(await readFile(migration, 'utf8'))
  await db.exec(await readFile(migration, 'utf8')) // Migration is safe to replay.
  await db.exec(await readFile(new URL('../migrations/20261103120000_timing_three_hits.sql', import.meta.url), 'utf8'))
  await db.query('insert into players(id,telegram_id,username,coins) values ($1,1,\'test\',300), ($2,2,\'other\',300)', [playerId, strangerId])
  await db.query('insert into player_cards(player_id,card_id) select $1,id from cards', [playerId])
})
after(() => db.close())

async function battle(round = 2) {
  await db.query('update player_cards set uses_left=3 where player_id=$1', [playerId])
  return (await db.query(`insert into battles(player_id,opponent_id,current_round,themes,current_hand)
    values ($1,1,$2,array['деньги','улица','ирония'],array[140,141,143,142]) returning id`, [playerId, round])).rows[0].id
}
async function prepare(id, kind = 'timing', round = 2, player = playerId, action = 'prepare') {
  return (await db.query('select mini_game_start($1,$2,$3,$4,$5) as game', [player, id, round, action, seed(kind)])).rows[0].game
}
async function finish(battleId, gameId, actionId, player = playerId) {
  return (await db.query('select mini_game_finish($1,$2,$3,$4) as game', [player, battleId, gameId, actionId])).rows[0].game
}
async function elapsed(gameId, ms) {
  await db.query("update battle_mini_games set started_at=clock_timestamp()-($2 * interval '1 millisecond') where id=$1", [gameId, ms])
}
function roundData(points = 70) {
  const side = { lines: ['a', 'b', 'c', 'd'], scores: { rhyme: 7, flow: 7, punch: 7, meaning: 7 }, points }
  return { round: { number: 2, theme: 'улица', player: side, opponent: { ...side, points: 60 }, winner: 'player' } }
}
async function submit(id, requestId = crypto.randomUUID(), points = 70, round = 2) {
  return (await db.query('select submit_round_atomic($1,$2,$3,$4,$5,$6) as result',
    [playerId, id, round, requestId, [140,141,143,142], roundData(points)])).rows[0].result
}

test('prepare/start are stable, hide the answer and do not restart the timer', async () => {
  const id = await battle()
  const first = await prepare(id, 'slang')
  assert.equal(first.started_at, null)
  assert.equal(first.prompt, null)
  assert.deepEqual(first.options, [])
  assert.equal(first.answer_id, undefined)
  assert.equal((await prepare(id, 'wave')).id, first.id)
  const started = await prepare(id, 'wave', 2, playerId, 'start')
  assert.equal(started.kind, 'slang')
  assert.equal(started.options.length, 3)
  assert.equal(started.answer_id, undefined)
  assert.equal((await prepare(id, 'timing', 2, playerId, 'start')).started_at, started.started_at)
})

test('foreign battles, round 1 and finished battles cannot start an attempt', async () => {
  const id = await battle()
  await assert.rejects(prepare(id, 'timing', 2, strangerId), /BATTLE_NOT_FOUND/)
  await assert.rejects(prepare(id, 'timing', 1), /INVALID_ROUND/)
  await db.query("update battles set status='finished' where id=$1", [id])
  await assert.rejects(prepare(id), /BATTLE_FINISHED/)
})

test('slang accepts only the saved answer, failures and retries are final', async () => {
  const id = await battle()
  const game = await prepare(id, 'slang', 2, playerId, 'start')
  await elapsed(game.id, 500)
  await assert.rejects(finish(id, game.id, 'a', strangerId), /BATTLE_NOT_FOUND/)
  await assert.rejects(finish(id, game.id, 'forged'), /INVALID_MINI_GAME_ACTION/)
  assert.equal((await finish(id, game.id, 'b')).penalty_points, 20)
  assert.equal((await finish(id, game.id, 'a')).penalty_points, 20)
  const second = await battle()
  const pass = await prepare(second, 'slang', 2, playerId, 'start')
  await elapsed(pass.id, 600)
  assert.equal((await finish(second, pass.id, 'a')).penalty_points, 0)
})

test('timing and wave use server time; timeout and early taps fail', async () => {
  for (const [kind, ms, action, penalty] of [
    ['timing', 100, 'tap-1', 15],
    ['timing', 3000, 'tap-1', 15], ['timing', 3000, 'timeout-1', 15],
    ['wave', 800, 'tap', 0], ['wave', 2400, 'tap', 0],
    ['wave', 1600, 'tap', 15], ['slang', 3000, 'a', 20],
  ]) {
    const id = await battle()
    const game = await prepare(id, kind, 2, playerId, 'start')
    await elapsed(game.id, ms)
    assert.equal((await finish(id, game.id, action)).penalty_points, penalty, `${kind} at ${ms}`)
  }
})

test('unstarted and skipped games cannot submit a round or consume cards', async () => {
  const id = await battle()
  const beforeUses = (await db.query('select uses_left from player_cards where player_id=$1 order by card_id', [playerId])).rows
  await assert.rejects(submit(id), /MINI_GAME_REQUIRED/)
  const game = await prepare(id)
  await assert.rejects(finish(id, game.id, 'tap-1'), /MINI_GAME_NOT_STARTED/)
  await assert.rejects(submit(id), /MINI_GAME_REQUIRED/)
  assert.deepEqual((await db.query('select uses_left from player_cards where player_id=$1 order by card_id', [playerId])).rows, beforeUses)
})

test('penalty changes winner and reward, retries cannot deduct twice', async () => {
  const id = await battle()
  await db.query('update battles set opponent_rounds_won=1 where id=$1', [id])
  const game = await prepare(id, 'timing', 2, playerId, 'start')
  await elapsed(game.id, 100)
  await finish(id, game.id, 'tap-1')
  const request = crypto.randomUUID()
  const result = await submit(id, request)
  assert.equal(result.round.player.base_points, 70)
  assert.equal(result.round.player.points, 55)
  assert.equal(result.round.player.penalty_points, 15)
  assert.equal(result.round.winner, 'opponent')
  assert.equal(result.battle.result, 'lose')
  assert.equal(result.rewards.coins_change, 0)
  assert.equal(result.next_round, null)
  assert.deepEqual(await submit(id, request), result)
  await assert.rejects(submit(id, request, 70, 3), /BATTLE_FINISHED/)
})

test('a saved failure survives prepare and cannot drive score below zero', async () => {
  const id = await battle()
  const game = await prepare(id, 'slang', 2, playerId, 'start')
  await elapsed(game.id, 3000)
  await finish(id, game.id, 'timeout')
  assert.equal((await prepare(id)).penalty_points, 20)
  const result = await submit(id, crypto.randomUUID(), 8)
  assert.equal(result.round.player.points, 0)
  assert.equal(result.round.mini_game.message, 'Забыл текст на**й!')
})

test('anon cannot read answers or execute game RPCs directly', async () => {
  await db.exec('set role anon')
  try {
    await assert.rejects(db.query('select * from battle_mini_games'), /permission denied/)
    await assert.rejects(db.query('select mini_game_start($1,$2,2,\'prepare\',$3)', [playerId, crypto.randomUUID(), seed()]), /permission denied/)
  } finally { await db.exec('reset role') }
})

test('three-round battle applies each attempt only to its own round; success gives no bonus', async () => {
  const id = await battle(1)
  const first = await submit(id, crypto.randomUUID(), 70, 1)
  assert.equal(first.round.player.points, 70)
  assert.equal(first.round.mini_game, null)
  const secondGame = await prepare(id, 'slang', 2, playerId, 'start')
  await elapsed(secondGame.id, 400)
  await finish(id, secondGame.id, 'b')
  const second = await submit(id)
  assert.equal(second.round.player.points, 50)
  assert.equal(second.battle.player_rounds_won, 1)
  assert.equal(second.battle.opponent_rounds_won, 1)
  assert.equal(second.next_round.number, 3)
  const thirdGame = await prepare(id, 'timing', 3, playerId, 'start')
  assert.notEqual(thirdGame.id, secondGame.id)
  await winTiming(id, thirdGame.id)
  const third = await submit(id, crypto.randomUUID(), 70, 3)
  assert.equal(third.round.player.points, 70)
  assert.equal(third.round.player.penalty_points, 0)
  assert.equal(third.battle.result, 'win')
  assert.equal(third.rewards.coins_change, 50)
  assert.equal(third.next_round, null)
  assert.deepEqual((await db.query('select uses_left from player_cards where player_id=$1', [playerId])).rows.map(r=>r.uses_left), [2,2,2,2])
})

test('expired active attempts resolve on recovery; a clean 2:0 cannot start a third game', async () => {
  const id = await battle()
  const game = await prepare(id, 'timing', 2, playerId, 'start')
  await elapsed(game.id, 4000)
  assert.equal((await prepare(id)).penalty_points, 15)
  assert.equal((await finish(id, game.id, 'tap-1')).penalty_points, 15)
  const clean = await battle(1)
  await submit(clean, crypto.randomUUID(), 70, 1)
  const pass = await prepare(clean, 'timing', 2, playerId, 'start')
  await winTiming(clean, pass.id)
  const result = await submit(clean)
  assert.equal(result.battle.player_rounds_won, 2)
  assert.equal(result.battle.opponent_rounds_won, 0)
  assert.equal(result.next_round, null)
  await assert.rejects(prepare(clean, 'timing', 3), /BATTLE_FINISHED/)
})

async function winTiming(id, gameId) {
  await elapsed(gameId, 600)
  let state = await finish(id, gameId, 'tap-1')
  assert.equal(state.timing_hits, 1)
  assert.equal(state.penalty_points, null)
  await elapsed(gameId, 500)
  state = await finish(id, gameId, 'tap-2')
  assert.equal(state.timing_hits, 2)
  assert.equal(state.penalty_points, null)
  // Fix the third-stage fixture, then tap its first centre crossing.
  await db.query("update battle_mini_games set question=jsonb_set(question,'{timing_path}','[0,1,0,1,0,1,0,1]') where id=$1", [gameId])
  await elapsed(gameId, 150)
  state = await finish(id, gameId, 'tap-3')
  assert.equal(state.timing_hits, 3)
  assert.equal(state.penalty_points, 0)
  return state
}

test('timing requires three hits, persists stages and ignores duplicate actions', async () => {
  const id = await battle()
  const g = await prepare(id, 'timing', 2, playerId, 'start')
  assert.equal(g.duration_ms, 1200)
  await assert.rejects(finish(id, g.id, 'tap-3'), /INVALID_MINI_GAME_ACTION/)
  await elapsed(g.id, 600)
  const first = await finish(id, g.id, 'tap-1')
  assert.equal(first.timing_hits, 1)
  assert.equal(first.duration_ms, 1000)
  assert.equal(first.penalty_points, null)
  const retry = await finish(id, g.id, 'tap-1')
  assert.equal(retry.timing_hits, 1)
  assert.equal(retry.started_at, first.started_at)
  assert.equal((await finish(id, g.id, 'timeout-1')).timing_hits, 1)
  assert.equal((await prepare(id)).timing_hits, 1)
  await assert.rejects(submit(id), /MINI_GAME_REQUIRED/)
  await elapsed(g.id, 500)
  const second = await finish(id, g.id, 'tap-2')
  assert.equal(second.timing_hits, 2)
  assert.equal(second.duration_ms, 2100)
  await elapsed(g.id, 10)
  assert.equal((await finish(id, g.id, 'tap-3')).penalty_points, 15)
})

test('browser and SQL agree on forward, reverse and chaotic positions', async () => {
  const path = [0,1,0,1,0,1,0,1]
  for (const [elapsedMs, hits, expected] of [[0,0,0],[600,0,.5],[1200,0,1],[0,1,1],[250,1,.75],[1000,1,0],[150,2,.5],[300,2,1],[450,2,.5],[600,2,0],[2100,2,1]]) {
    assert.ok(Math.abs(timingPosition(elapsedMs,hits,path)-expected)<.00001)
    const pos=(await db.query('select timing_position($1,$2,$3) as p',[elapsedMs,hits,path])).rows[0].p
    assert.ok(Math.abs(Number(pos)-expected)<.00001)
  }
})
