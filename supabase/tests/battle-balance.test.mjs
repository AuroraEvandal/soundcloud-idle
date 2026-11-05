import assert from 'node:assert/strict'
import { test } from 'node:test'
import { skilledPoints } from '../functions/_shared/battleBalance.ts'

const scores = { rhyme: 8, flow: 8, punch: 8, meaning: 8 }
const settings = { skill_step: 0.02, charisma_step: 0.01, max_skill_bonus: 0.5 }
test('starter skills preserve the old points; skill and outfit bonuses affect the server total', () => {
  assert.equal(skilledPoints(scores, {}, 0, settings), 80)
  assert.equal(skilledPoints(scores, { skill_rhyme: 11 }, 0, settings), 84)
  assert.equal(skilledPoints(scores, { skill_charisma: 11 }, 0, settings), 88)
  assert.equal(skilledPoints(scores, {}, 10, settings), 88)
  assert.deepEqual(scores, { rhyme: 8, flow: 8, punch: 8, meaning: 8 })
})
test('caps and coefficient edits can rebalance progression without changing the algorithm', () => {
  assert.equal(skilledPoints(scores, { skill_rhyme: 999 }, 0, settings), 90)
  assert.equal(skilledPoints(scores, { skill_charisma: 999 }, 999, settings), 120)
  assert.equal(skilledPoints(scores, { skill_rhyme: 999, skill_charisma: 999 }, 10,
    { skill_step: 0, charisma_step: 0, max_skill_bonus: 0 }), 80)
})
