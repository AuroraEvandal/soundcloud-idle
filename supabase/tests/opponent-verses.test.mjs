import assert from 'node:assert/strict'
import { test } from 'node:test'
import { opponentVerse } from '../functions/_shared/opponentVerses.js'

test('each artist has intact supplied verses, stable on reload and distinct across three rounds', () => {
  for (let id = 1; id <= 5; id++) {
    const verses = [1, 2, 3].map(round => opponentVerse(id, '0a1b2c3d-0000-4000-8000-000000000001', round))
    assert.equal(new Set(verses.map(lines => JSON.stringify(lines))).size, 3)
    for (let round = 1; round <= 3; round++) {
      assert.deepEqual(opponentVerse(id, '0a1b2c3d-0000-4000-8000-000000000001', round), verses[round - 1])
      assert.ok(verses[round - 1].length >= 4)
      assert.ok(verses[round - 1].every(line => typeof line === 'string' && line.trim()))
    }
    const firstLines = new Set(Array.from({ length: 50 }, (_, i) => opponentVerse(id, String(i), 1)[0]))
    assert.ok(firstLines.size >= 3, 'new battles can select different verses')
  }
})

test('DOOM RUSHA attributes every guest and unknown opponents retain the existing fallback', () => {
  const credits = new Set(Array.from({ length: 50 }, (_, i) => opponentVerse(5, String(i), 1)[0]))
  assert.deepEqual([...credits].sort(), [
    'Тебя батлил Хабип Мацуевич!', 'Тебя батлил Вайтнер!', 'Тебя батлил OSIRISGWAP!',
    'Тебя батлил platooplomo!', 'Тебя батлил Benjamin!',
  ].sort())
  assert.equal(opponentVerse(99, 'battle', 1), null)
})
