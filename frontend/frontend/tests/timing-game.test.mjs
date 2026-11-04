import assert from 'node:assert/strict'
import { test } from 'node:test'
import { miniGameClockOffset } from '../src/timingGame.js'

test('server processing cannot move the timing animation ahead of the real cursor', () => {
  assert.equal(miniGameClockOffset({ kind: 'timing', server_now: 10000, server_processing_ms: 600 }, 100, 700), 9300)
  // 600ms processing and 100ms network: only 50ms estimates the return journey.
  assert.equal(miniGameClockOffset({ kind: 'timing', server_now: 10000, server_processing_ms: 600 }, 100, 800), 9250)
  assert.equal(miniGameClockOffset({ kind: 'timing', server_now: 10000 }, 100, 700), 9300)
})
