import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

for (const file of ['check-minis.js', 'check-timing-v2.js']) {
  test(`${file} only intercepts mini-games and removes its handler after failure`, async () => {
    const source = await readFile(new URL(`../../../output/playwright/${file}`, import.meta.url), 'utf8')
    const run = runInNewContext(`(${source})`)
    const installed = [], removed = []
    const stopped = new Error('Stop before browser interaction')
    await assert.rejects(run({
      on() {},
      async route(pattern, handler) { installed.push({ pattern, handler }) },
      async unroute(pattern, handler) { removed.push({ pattern, handler }) },
      async setViewportSize() { throw stopped },
    }), (error) => error === stopped)
    assert.equal(installed.length, 1)
    const { pattern, handler } = installed[0]
    const matches = (name) => {
      const url = `http://127.0.0.1:54329/functions/v1/${name}`
      return typeof pattern === 'string' ? posix.matchesGlob(url, pattern) : pattern.test(url)
    }
    assert.equal(matches('start-mini-game'), true)
    assert.equal(matches('finish-mini-game'), true)
    assert.equal(matches('login'), false, 'The UI fixture must not answer login')
    assert.equal(matches('submit-round'), false)
    assert.deepEqual(removed, [{ pattern, handler }], 'Remove only this test handler, even on failure')
  })
}
