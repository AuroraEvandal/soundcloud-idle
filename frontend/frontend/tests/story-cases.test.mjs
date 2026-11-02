import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { STORY_SCENES, shouldShowIntro } from '../src/story.js'
import { CASES } from '../src/caseCatalog.js'
import { readIntro, saveIntro } from '../src/storage.js'

test('intro shows for new players and interrupted viewers, never completed viewers', () => {
  assert.equal(shouldShowIntro(true, null), true)
  assert.equal(shouldShowIntro(false, null), false)
  assert.equal(shouldShowIntro(false, 'started'), true)
  assert.equal(shouldShowIntro(true, 'done'), false)
  assert.equal(shouldShowIntro(false, 'done'), false)
  assert.equal(STORY_SCENES.length, 5)
  assert.equal(STORY_SCENES.at(-1).id, 'challenge')
})

test('intro markers are isolated per player and tolerate unavailable storage', () => {
  const data = new Map()
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  saveIntro('alice', 'done')
  saveIntro('bob', 'started')
  assert.equal(readIntro('alice'), 'done')
  assert.equal(readIntro('bob'), 'started')
  globalThis.localStorage = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  assert.equal(readIntro('alice'), null)
  assert.doesNotThrow(() => saveIntro('alice', 'done'))
  delete globalThis.localStorage
})

test('preview catalog has complete category odds and no invented gift odds', () => {
  assert.deepEqual(CASES.map((box) => box.price), [29, 100])
  assert.equal(CASES[0].rewards.reduce((total, reward) => total + reward.chance, 0), 100)
  assert.ok(CASES[0].rewards.every((reward) => reward.chance > 0))
  assert.ok(CASES[1].rewards.every((reward) => reward.chance === undefined))
  for (const box of CASES) {
    assert.ok(existsSync(new URL(`../public${box.image}`, import.meta.url)))
    assert.equal(new Set(box.rewards.map((reward) => reward.id)).size, box.rewards.length)
  }
  assert.ok(existsSync(new URL('../public/player/freshman.png', import.meta.url)))
})
