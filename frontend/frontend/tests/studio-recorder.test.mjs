import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStudioRecorder } from '../src/studioRecorder.js'

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
const result = (hype = 0, released = []) => ({ player: { id: 'a', coins: 300 },
  studio: { hype, hype_max: 20, energy: 100, energy_max: 100 }, released })
function setup(options = {}) {
  const data = new Map(), timers = new Map()
  let serial = 0
  const storage = { getItem: (k) => data.get(k), setItem: (k,v) => data.set(k,v), removeItem: (k) => data.delete(k) }
  const settings = { playerId: 'a', storage, fetchStudio: async () => result(19), send: async () => result(),
    schedule: (fn) => { const id = ++serial; timers.set(id, fn); return id }, cancel: (id) => timers.delete(id), ...options }
  return { recorder: createStudioRecorder(settings), settings, data, timers }
}

test('the final tap sends immediately and holds the full meter until a slow server confirms the reward', async () => {
  const response = deferred(), calls = []
  const { recorder } = setup({ send: (...args) => { calls.push(args); return response.promise } })
  await recorder.load()
  assert.equal(recorder.tap(), true)
  assert.equal(calls.length, 1) // no 250/600 ms delay at the release boundary
  assert.equal(recorder.snapshot().studio.hype, 20)
  assert.equal(recorder.snapshot().releasing, true)
  assert.deepEqual(recorder.snapshot().releases, []) // no invented rewards
  for (let n = 0; n < 30; n++) assert.equal(recorder.tap(), false)
  response.resolve(result(0, [{ streams: 150, coins: 15, popularity_change: 2 }]))
  await response.promise; await Promise.resolve()
  assert.equal(recorder.snapshot().releases[0].coins, 15)
  assert.equal(recorder.tap(), false) // result is still on screen
  recorder.acknowledgeRelease()
  assert.equal(recorder.tap(), true)
  recorder.dispose()
})

test('taps queued behind an earlier request do not roll back or cross the next release', async () => {
  const response = deferred(), calls = []
  const { recorder, timers } = setup({ fetchStudio: async () => result(17), send: (...args) => { calls.push(args); return response.promise } })
  await recorder.load()
  recorder.tap()
  const task = recorder.flush()
  recorder.tap(); recorder.tap()
  assert.equal(recorder.snapshot().studio.hype, 20)
  assert.equal(recorder.tap(), false)
  response.resolve(result(18)); await task
  assert.equal(recorder.snapshot().studio.hype, 20)
  assert.equal(calls.length, 1)
  assert.equal(timers.size, 1)
  recorder.dispose()
})

test('an ambiguous response survives a full reload and replays precisely the saved batch ID', async () => {
  const calls = []
  const { recorder, settings } = setup({ send: async (...args) => { calls.push(args); throw { code: 'INTERNAL', ambiguous: true } } })
  await recorder.load(); recorder.tap(); await Promise.resolve(); await Promise.resolve()
  assert.equal(recorder.snapshot().releasing, true)
  recorder.dispose()
  const reloaded = createStudioRecorder({ ...settings, send: async (...args) => { calls.push(args); return result(0, [{ coins: 15 }]) } })
  await reloaded.load(); await Promise.resolve()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(reloaded.snapshot().releases.length, 1)
  reloaded.dispose()
})

test('a read that began before a write cannot restore old hype and balance', async () => {
  const oldRead = deferred()
  const { recorder, settings } = setup()
  let reads = 0
  const queue = createStudioRecorder({ ...settings, fetchStudio: () => ++reads === 1 ? Promise.resolve(result(19)) : oldRead.promise })
  await queue.load()
  const loading = queue.load()
  queue.tap(); await Promise.resolve(); await Promise.resolve()
  oldRead.resolve(result(19)); await loading
  assert.equal(queue.snapshot().studio.hype, 0)
  queue.dispose(); recorder.dispose()
})

test('energy display recovers with elapsed time without granting a client reward', async () => {
  let now = 0
  const { recorder } = setup({ now: () => now, fetchStudio: async () => ({ ...result(0), studio: { ...result().studio, energy: 0 } }) })
  await recorder.load()
  assert.equal(recorder.snapshot().canTap, false)
  now = 3000; recorder.tick()
  assert.equal(recorder.snapshot().studio.energy, 1)
  assert.equal(recorder.snapshot().canTap, true)
  assert.deepEqual(recorder.snapshot().releases, [])
  recorder.dispose()
})
