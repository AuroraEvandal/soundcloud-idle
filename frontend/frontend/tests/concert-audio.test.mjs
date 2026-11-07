import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { createConcertAudio } from '../src/concert/audio.js'

const saved = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), fetch: globalThis.fetch }
let player
afterEach(() => {
  player?.dispose(); player = null
  globalThis.window = saved.window; globalThis.fetch = saved.fetch
  Object.defineProperty(globalThis, 'navigator', saved.navigator)
})
function browser(running = true) {
  const contexts = [], sources = [], parameters = []
  const param = () => ({ value: 0, setValueAtTime(v) { parameters.push(v) }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { parameters.push(v) } })
  const node = () => ({ connect() {}, disconnect() {}, gain: param() })
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this) }
    resume() { if (running) this.state = 'running'; return Promise.resolve() }
    suspend() { this.state = 'suspended'; return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
    createGain() { return node() }
    createDynamicsCompressor() { return { ...node(), threshold: param(), ratio: param() } }
    createBiquadFilter() { return { ...node(), frequency: param() } }
    createDelay() { return { ...node(), delayTime: param() } }
    createBufferSource() { const s = { ...node(), playbackRate: param(), start(at) { this.startedAt = at; sources.push(s) }, stop() { this.stopped = true } }; return s }
    createOscillator() { const source = this.createBufferSource(); source.frequency = param(); return source }
    decodeAudioData() { return Promise.resolve({ duration: .7 }) }
  }
  globalThis.window = { AudioContext: Context }
  const session = { type: 'auto' }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: session } })
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  player = createConcertAudio()
  return { contexts, sources, parameters, session }
}

test('concert clock freezes with audio, resumes and releases the music session on disposal', async () => {
  const { contexts, sources, session } = browser()
  await player.start()
  contexts[0].currentTime = 10.08
  assert.equal(player.time, 10)
  assert.ok(sources.length > 0)
  await player.pause()
  assert.equal(player.suspended, true)
  assert.equal(player.time, 10)
  await player.resume()
  assert.equal(player.suspended, false)
  player.dispose()
  assert.equal(contexts[0].state, 'closed')
  assert.equal(session.type, 'auto')
  assert.ok(sources.every(s => s.stopped))
})

test('real controls reach the filter, master volume and vocal channel', async () => {
  const { parameters } = browser()
  await player.start()
  player.set('frequency', 60)
  player.set('level', 50)
  player.set('voice', false)
  assert.deepEqual(parameters.slice(-3), [10900, .39, 0])
  player.set('voice', true)
  assert.equal(parameters.at(-1), .65)
})

test('closed or suspended audio cannot silently start a concert', async () => {
  const { sources } = browser(false)
  await assert.rejects(player.start(), /звук|Браузер/)
  assert.equal(sources.length, 0)
})

test('leaving while samples load cannot create sound after disposal', async () => {
  const { sources } = browser()
  let release
  const response = new Promise(resolve => { release = resolve })
  globalThis.fetch = () => response
  const pending = player.start()
  player.dispose()
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  assert.equal(await pending, false)
  assert.equal(sources.length, 0)
})

test('calibration supplies quarter-note clicks and never requests musical samples', async () => {
  const { contexts, sources } = browser()
  globalThis.fetch = () => { throw new Error('Calibration must not load a backing track') }
  await player.start(0, { metronome: true })
  assert.equal(sources.length, 1)
  assert.equal(sources[0].frequency.value, 800)
  assert.equal(sources[0].startedAt, .08)
  contexts[0].currentTime = .56
  await new Promise(resolve => setTimeout(resolve, 35))
  assert.equal(sources.length, 2)
  assert.equal(sources[1].startedAt, .58)
})

test('effects enable audible echo and restore the dry signal when disabled', async () => {
  const { parameters } = browser()
  await player.start()
  player.set('effect', true)
  assert.deepEqual(parameters.slice(-2), [1400, .18])
  player.set('effect', false)
  assert.deepEqual(parameters.slice(-2), [12000, 0])
})
