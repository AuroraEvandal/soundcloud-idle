import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { errorInfo } from '../src/errors.js'

test('locked opponent errors explain both fan and victory requirements', () => {
  assert.match(errorInfo({ code: 'OPPONENT_LOCKED' }).message, /победи предыдущего соперника/)
  assert.equal(errorInfo({ code: 'OPPONENT_LOCKED' }, { required: 30 }).message,
    'Нужно 30 фанатов и победа над предыдущим соперником')
})

test('dev mock checks completed wins across the full history for profile and battle start', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    define: { 'import.meta.env.DEV': 'true' },
    plugins: [{ name: 'inspect-mock-fixture', enforce: 'pre', transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/api.js')) return `${code}\nexport { db as testDb, mock as testMock }`
    } }],
  })
  try {
    const { testDb: db, testMock: mock } = await vite.ssrLoadModule('/src/api.js')
    db.player = { popularity: 1000 }
    const unlocked = () => mock.getProfile().opponents.map(o => o.unlocked)
    assert.deepEqual(unlocked(), [true, false, false, false, false])
    assert.throws(() => mock.startBattle(2), e => e.code === 'OPPONENT_LOCKED')
    for (const [status, result] of [['finished', 'loss'], ['finished', 'draw'], ['active', 'win']]) {
      db.battles.example = { opp: { id: 1 }, status, last_result: { battle: { result } } }
      assert.equal(unlocked()[1], false)
      assert.throws(() => mock.startBattle(2), e => e.code === 'OPPONENT_LOCKED')
    }
    db.battles.example.status = 'finished'
    db.recent = Array.from({ length: 5 }, () => ({ result: 'loss' }))
    assert.deepEqual(unlocked(), [true, true, false, false, false])
    db.player.popularity = 29
    assert.equal(unlocked()[1], false)
    assert.throws(() => mock.startBattle(2), e => e.code === 'OPPONENT_LOCKED')
    db.player.popularity = 30
    assert.equal(mock.startBattle(2).battle.opponent.id, 2)
  } finally { await vite.close() }
})
