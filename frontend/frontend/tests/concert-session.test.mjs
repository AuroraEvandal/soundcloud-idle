import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createConcertSession, concertClock } from '../src/concert/session.js'

test('visual clock accounts for network travel without counting server work or paused time', () => {
  const show = {status:'active',paused:false,elapsed_ms:5000,scene_elapsed_ms:1000,events:[{id:'one'}],scene_index:0,outcomes:{}}
  assert.deepEqual(concertClock({show,client_rtt_ms:600,server_processing_ms:200}),{elapsed:5.2,scene:1.2})
  assert.deepEqual(concertClock({show:{...show,paused:true},client_rtt_ms:600}),{elapsed:5,scene:1})
  assert.deepEqual(concertClock({show,client_rtt_ms:50000}),{elapsed:5.25,scene:1.25})
  assert.deepEqual(concertClock({show,client_rtt_ms:20,server_processing_ms:50}),{elapsed:5,scene:1})
})

test('server actions are serial and late state cannot roll back a newer scene', async () => {
  const calls = [], states = []
  let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const session = createConcertSession(async (action) => {
    calls.push(action)
    entered()
    if (action === 'input') await gate
    return { action }
  }, state => states.push(state.action))
  const a = session.run('input'), b = session.run('next')
  await started
  assert.deepEqual(calls, ['input'])
  release()
  await Promise.all([a, b])
  assert.deepEqual(states, ['input', 'next'])
})

test('an ambiguous action blocks later mutations and retries its original IDs', async () => {
  const calls = [], states = []
  const session = createConcertSession(async (action, body) => {
    calls.push({ action, body })
    if (calls.length === 1) throw new Error('network')
    return { action }
  }, state => states.push(state.action))
  await assert.rejects(session.run('input', { showId: 'show', sceneId: 'one', actionId: 'pad-2' }), /network/)
  await assert.rejects(session.run('next', { showId: 'show' }), /RETRY_REQUIRED/)
  await session.retry()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], calls[1])
  assert.deepEqual(calls[0].body, { showId: 'show', sceneId: 'one', actionId: 'pad-2', requestId: calls[0].body.requestId })
  assert.match(calls[0].body.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(states, ['input'])
})

test('a definite rejected purchase does not block reading or continuing a show', async () => {
  const session = createConcertSession(async action => {
    if (action === 'buy') throw Object.assign(new Error('funds'), { code: 'NOT_ENOUGH_COINS' })
    return { show: null }
  }, () => {})
  await assert.rejects(session.run('buy', { itemId: 'knobs' }), /funds/)
  assert.deepEqual(await session.run('get'), { show: null })
})

test('reopening retries a lost next before get, then gives the next scene a fresh delivery ID', async () => {
  const values = new Map(), calls = [], seen = new Set()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let scene = 0, lose = true
  const send = async (action, body) => {
    calls.push({ action, body })
    if (action === 'next' && !seen.has(body.requestId)) {
      seen.add(body.requestId); scene++
      if (lose) { lose = false; throw new Error('response lost after commit') }
    }
    return { show: { scene_index: scene } }
  }
  const oldSession = createConcertSession(send, () => {}, () => storage)
  await assert.rejects(oldSession.run('next', { showId: 'show', sceneId: 'scene-1' }), /lost/)
  assert.equal(values.size, 1, 'unconfirmed command survives component disposal')
  const reopened = createConcertSession(send, () => {}, () => storage)
  assert.equal((await reopened.run('get')).show.scene_index, 1)
  assert.deepEqual(calls.map(call => call.action), ['next', 'next', 'get'])
  assert.equal(calls[0].body.requestId, calls[1].body.requestId)
  assert.equal(values.size, 0)
  assert.equal((await reopened.run('next', { showId: 'show', sceneId: 'scene-2' })).show.scene_index, 2)
  assert.notEqual(calls[0].body.requestId, calls.at(-1).body.requestId)
})

test('unavailable storage keeps retries safe and identical new commands get different UUIDs', async () => {
  const calls = []
  const session = createConcertSession(async (action, body) => {
    calls.push({ action, body })
    if (calls.length === 1) throw new Error('offline')
    return { show: null }
  }, () => {}, () => { throw new Error('storage disabled') })
  await assert.rejects(session.run('pause', { showId: 'show' }), /offline/)
  await session.retry()
  await session.run('pause', { showId: 'show' })
  assert.match(calls[0].body.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(calls[0].body.requestId, calls[1].body.requestId)
  assert.notEqual(calls[1].body.requestId, calls[2].body.requestId)
})

test('ambiguous recovery keeps blocking reads; a definite rejection clears it and fetches current state', async () => {
  let saved = null, reject = false
  const calls = []
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value }, removeItem: () => { saved = null } }
  const send = async action => {
    calls.push(action)
    if (action === 'buy') throw reject ? Object.assign(new Error('owned'), { code: 'ALREADY_OWNED' }) : new Error('offline')
    return { show: null }
  }
  await assert.rejects(createConcertSession(send, () => {}, () => storage).run('buy', { itemId: 'marks' }), /offline/)
  const reopened = createConcertSession(send, () => {}, () => storage)
  await assert.rejects(reopened.run('get'), /offline/)
  await assert.rejects(reopened.run('get'), /RETRY_REQUIRED/)
  assert.ok(saved)
  assert.deepEqual(calls, ['buy', 'buy'])
  reject = true
  const recovered = createConcertSession(send, () => {}, () => storage)
  assert.deepEqual(await recovered.run('get'), { show: null })
  assert.equal(saved, null)
  assert.deepEqual(calls, ['buy', 'buy', 'buy', 'get'])
})

test('stored pending commands are scoped to the Telegram user and malformed data is ignored', async () => {
  const originalWindow = globalThis.window, values = new Map(), calls = []
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  try {
    globalThis.window = { Telegram: { WebApp: { initDataUnsafe: { user: { id: 81 } } } } }
    await assert.rejects(createConcertSession(async () => { throw new Error('offline') }, () => {}, () => storage).run('buy', { itemId: 'marks' }))
    globalThis.window.Telegram.WebApp.initDataUnsafe.user.id = 82
    const send = async action => { calls.push(action); return { show: null } }
    await createConcertSession(send, () => {}, () => storage).run('get')
    assert.deepEqual(calls, ['get'])
    assert.ok(values.get('sw_concert_pending_v1:81'))
    values.set('sw_concert_pending_v1:82', '{invalid')
    await createConcertSession(send, () => {}, () => storage).run('get')
    assert.deepEqual(calls, ['get', 'get'])
  } finally { globalThis.window = originalWindow }
})

test('a delayed response from an unmounted session cannot delete a newer pending command', async () => {
  let saved = null, release, enter, calls = 0
  const started = new Promise(resolve => { enter = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value }, removeItem: () => { saved = null } }
  const send = async action => {
    calls++
    if (calls === 1) { enter(); await gate }
    else if (action === 'next') throw new Error('new command response lost')
    return { show: null }
  }
  const first = createConcertSession(send, () => {}, () => storage)
  const oldResponse = first.run('pause', { showId: 'show' })
  await started
  const reopened = createConcertSession(send, () => {}, () => storage)
  await reopened.run('get')
  await assert.rejects(reopened.run('next', { showId: 'show', sceneId: 'scene-1' }), /lost/)
  const newer = JSON.parse(saved)
  release(); await oldResponse
  assert.equal(JSON.parse(saved)?.requestId, newer.requestId)
})
