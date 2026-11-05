import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let vite, api, invoke
const originalWindow = globalThis.window
const battleId = '00000000-0000-4000-8000-000000000099'
const miniGameId = '00000000-0000-4000-8000-000000000003'

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54329'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-test-public-key'),
    },
  })
  const { supabase } = await vite.ssrLoadModule('/src/supabase.js')
  Object.defineProperty(supabase, 'functions', { value: { invoke: (...args) => invoke(...args) } })
  api = await vite.ssrLoadModule('/src/api.js')
  globalThis.window = { Telegram: { WebApp: { initData: 'test-init-data' } } }
})

after(async () => {
  globalThis.window = originalWindow
  await vite?.close()
})

test('login and mini-games send the documented IDs and initData without client scores', async () => {
  const calls = []
  invoke = async (name, { body }) => { calls.push({ name, body }); return { data: { penalty_points: null } } }
  await api.login()
  await api.startMiniGame(battleId, 2)
  await api.startMiniGame(battleId, 2, 'start')
  assert.equal((await api.finishMiniGame(battleId, miniGameId, 'tap-1')).penalty_points, null)
  assert.deepEqual(calls, [
    { name: 'login', body: { initData: 'test-init-data' } },
    { name: 'start-mini-game', body: { initData: 'test-init-data', battleId, roundNumber: 2, actionId: 'prepare' } },
    { name: 'start-mini-game', body: { initData: 'test-init-data', battleId, roundNumber: 2, actionId: 'start' } },
    { name: 'finish-mini-game', body: { initData: 'test-init-data', battleId, miniGameId, actionId: 'tap-1' } },
  ])
})

test('HTTP errors keep their game code instead of becoming a network error', async () => {
  for (const [status, code, call] of [
    [401, 'INVALID_INIT_DATA', () => api.login()],
    [400, 'INVALID_ROUND', () => api.startMiniGame(battleId, 2)],
    [400, 'INVALID_MINI_GAME_ACTION', () => api.finishMiniGame(battleId, miniGameId, 'tap')],
  ]) {
    invoke = async () => ({ error: { context: Response.json({ error: { code } }, { status }) } })
    await assert.rejects(call, (error) => error.code === code && !error.network)
  }
})

test('a failed finish can retry the same action and read the final server result', async () => {
  const calls = []
  invoke = async (name, { body }) => {
    calls.push({ name, body })
    if (calls.length === 1) throw new TypeError('Failed to fetch')
    return { data: { penalty_points: 15 } }
  }
  await assert.rejects(api.finishMiniGame(battleId, miniGameId, 'tap-2'), (error) => error.network)
  assert.equal((await api.finishMiniGame(battleId, miniGameId, 'tap-2')).penalty_points, 15)
  assert.deepEqual(calls[0], calls[1])
})

test('pet and case routes send IDs only and use real server responses', async () => {
  const calls = []
  const envelope = { pets: [{ id: 'soundity', level: 1, friendship: 3 }], active_pet_id: 'soundity', income_pct: 1 }
  invoke = async (name, { body }) => { calls.push({ name, body }); return { data: envelope } }
  assert.deepEqual(await api.getPets(), envelope)
  await api.equipPet('soundity')
  await api.equipPet(null)
  await api.getCases()
  await api.openCase('free')
  await api.createCaseInvoice('underground')
  await api.getCaseOrder(battleId)
  const { initData, ...freeBody } = calls[4].body
  assert.equal(initData, 'test-init-data')
  assert.match(freeBody.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(calls.map(({ name }) => name), ['get-pets', 'equip-pet', 'equip-pet', 'get-cases', 'open-case', 'create-case-invoice', 'get-case-order'])
  assert.deepEqual(calls[1].body, { initData: 'test-init-data', petId: 'soundity' })
  assert.deepEqual(calls[2].body, { initData: 'test-init-data', petId: null })
  assert.deepEqual(Object.keys(freeBody).sort(), ['caseId', 'requestId'])
  assert.deepEqual(Object.keys(calls[5].body).sort(), ['caseId', 'initData', 'requestId'])
  assert.deepEqual(calls[6].body, { initData: 'test-init-data', orderId: battleId })
})

test('free case, invoice, and recording retries preserve their request ID after a lost response', async () => {
  for (const request of [() => api.openCase('free'), () => api.createCaseInvoice('gift-vault'), () => api.recordSnippet(20)]) {
    const calls = []
    invoke = async (name, { body }) => {
      calls.push({ name, body })
      if (calls.length === 1) throw new TypeError('Failed to fetch')
      return { data: { accepted: true } }
    }
    await assert.rejects(request, (e) => e.network)
    assert.deepEqual(await request(), { accepted: true })
    assert.deepEqual(calls[0], calls[1])
  }
})

test('recording accepts a UUID tied to the batch, so equal-sized new batches stay distinct', async () => {
  const calls = []
  invoke = async (name, { body }) => { calls.push({ name, body }); return { data: {} } }
  const first = crypto.randomUUID(), second = crypto.randomUUID()
  await api.recordSnippet(20, first)
  await api.recordSnippet(20, first)
  await api.recordSnippet(20, second)
  assert.deepEqual(calls[0], calls[1])
  assert.notEqual(calls[1].body.requestId, calls[2].body.requestId)
  assert.equal(calls[2].body.taps, 20)
})

test('pack retries reuse the request ID and a confirmed new opening gets another ID', async () => {
  const calls = []
  invoke = async (name, { body }) => {
    calls.push({ name, body })
    if (calls.length === 1) throw new TypeError('Failed to fetch')
    return { data: { accepted: true } }
  }
  await assert.rejects(() => api.openPack(1), (e) => e.network)
  await api.openPack(1)
  await api.openPack(1)
  assert.equal(calls[0].name, 'open-pack')
  assert.match(calls[0].body.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(calls[0], calls[1])
  assert.notEqual(calls[1].body.requestId, calls[2].body.requestId)
})

test('HTTP 5xx leaves an operation ambiguous and retains its ID until success', async () => {
  for (const request of [() => api.recordSnippet(17), () => api.openPack(1), () => api.openCase('free')]) {
    const calls = []
    invoke = async (name, { body }) => {
      calls.push({ name, body })
      return calls.length === 1
        ? { error: { context: Response.json({ error: { code: 'INTERNAL' } }, { status: 500 }) } }
        : { data: { accepted: true } }
    }
    await assert.rejects(request, (e) => e.code === 'INTERNAL' && e.ambiguous && !e.network)
    await request()
    assert.deepEqual(calls[0], calls[1])
  }
})

test('database-heavy game functions are routed to the database region', async () => {
  let options
  invoke = async (_name, input) => { options = input; return { data: {} } }
  await api.getStudio()
  assert.equal(options.region, 'ap-southeast-2')
})
