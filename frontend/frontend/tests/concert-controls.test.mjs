import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { controlAction, createControlStream, targetPosition } from '../src/concert/controlTransport.js'

test('control IDs contain only bounded integer positions and server target remains presentation', () => {
  assert.equal(controlAction('frequency', 41.6), 'dial-42')
  assert.equal(controlAction('level', -5), 'fader-0')
  assert.equal(controlAction('crossfade', 110), 'fader-100')
  assert.equal(targetPosition({ target: 50, moving: false }, 20), 50)
  assert.equal(targetPosition({ target: 98, moving: true, amplitude: 10 }, .65 * Math.PI / 2), 100)
  assert.ok(Math.abs(targetPosition({ target: 50, moving: true, amplitude: 10 }, .65 * Math.PI / 2) - 60) < .001)
})

test('stationary controls sample every 300ms, coalesce changes and stop on pause', async () => {
  let tick, interval, stopped = false, release
  const actions = []
  const stream = createControlStream(action => { actions.push(action); return new Promise(resolve => { release = resolve }) }, {
    setInterval(callback, milliseconds) { tick = callback; interval = milliseconds; return 1 },
    clearInterval(timer) { assert.equal(timer, 1); stopped = true },
  })
  stream.update('dial-40')
  assert.equal(interval, 300)
  assert.deepEqual(actions, ['dial-40'])
  stream.update('dial-41'); stream.update('dial-42')
  tick(); tick()
  assert.deepEqual(actions, ['dial-40'], 'slow requests cannot create a backlog')
  release(); await Promise.resolve()
  tick()
  assert.deepEqual(actions, ['dial-40', 'dial-42'], 'only latest raw input gets sent')
  release(); await Promise.resolve()
  tick()
  assert.deepEqual(actions, ['dial-40', 'dial-42', 'dial-42'], 'stationary controls keep the hold alive')
  stream.stop(); tick()
  assert.equal(stopped, true)
  assert.equal(actions.length, 3)
  release(); await Promise.resolve()
  stream.update('dial-43')
  assert.equal(actions.at(-1), 'dial-43', 'resuming restarts the stream')
  stream.stop(); release()
})

test('a failed input leaves the next sample available', async () => {
  let tick, calls = 0
  const stream = createControlStream(async () => { calls++; throw new Error('offline') }, { setInterval(fn) { tick = fn }, clearInterval() {} })
  stream.update('fader-12')
  await Promise.resolve()
  await tick()
  assert.equal(calls, 2)
  stream.stop()
})

test('all nine controls render server progress, staged releases and hidden memory accessibly', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  try {
    const Controls = (await vite.ssrLoadModule('/src/concert/Controls.jsx')).default
    const base = { id: 'scene-a', duration: 7, target: 60, tolerance: 7, hold_ms: 1000, amplitude: 14, moving: true, sequence: [2, 0, 3], channel: 1, request: 'voice-off', reveal_ms: 1200 }
    const render = (event, time = 0, scene_progress = {}) => renderToStaticMarkup(createElement(Controls, { event, time, state: { outcomes: {}, scene_progress }, onAction: async () => {} }))
    for (const kind of ['frequency', 'level', 'pads', 'crossfade', 'feedback', 'artist', 'patch', 'blackout', 'power']) {
      const html = render({ ...base, kind, secondary: kind === 'level' })
      assert.match(html, new RegExp(`data-kind="${kind}"`))
      assert.doesNotMatch(html, /NaN|undefined/)
    }
    const held = render({ ...base, kind: 'level', secondary: true }, 2, { value: 60, hold_ms: 300, monitor: true })
    assert.match(held, /aria-valuenow="30"/)
    assert.match(held, /Вокал в мониторе ✓/)
    const reveal = render({ ...base, kind: 'blackout' }, .5)
    assert.match(reveal, /Порядок: C, A, D/)
    const memory = render({ ...base, kind: 'blackout' }, 1.3)
    assert.match(memory, /Последовательность скрыта/)
    assert.doesNotMatch(memory, /Порядок: C, A, D/)
    const waiting = render({ ...base, kind: 'artist' }, 1.5, { step: 1, voice: false, release_at_ms: 2000 })
    assert.match(waiting, /class="ct-command is-active" disabled=""/)
    assert.match(waiting, /ЗАЛ ПОЁТ/)
    const ready = render({ ...base, kind: 'artist' }, 2.1, { step: 1, voice: false, release_at_ms: 2000 })
    assert.match(ready, /ВЕРНУТЬ ВОКАЛ/)
    assert.doesNotMatch(ready, /class="ct-command is-active" disabled/)
    const channel = render({ ...base, kind: 'feedback' }, 2.1, { step: 1, muted: [1], release_at_ms: 2000 })
    assert.match(channel, /БАС, сигнал в норме. Вернуть канал/)
    assert.match(channel, /СВИСТ УШЁЛ/)
  } finally { await vite.close() }
})
