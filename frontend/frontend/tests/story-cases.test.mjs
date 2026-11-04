import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { STORY_SCENES, shouldShowIntro } from '../src/story.js'
import { CASE_ART } from '../src/caseCatalog.js'
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

test('case display metadata keeps all three server IDs and never generates rewards or payment prices', () => {
  assert.deepEqual(Object.keys(CASE_ART), ['free', 'underground', 'gift-vault'])
  for (const box of Object.values(CASE_ART)) {
    assert.ok(existsSync(new URL(`../public${box.image}`, import.meta.url)))
    assert.equal(box.price, undefined)
    assert.equal(box.rewards, undefined)
    assert.equal(box.pet_chance, undefined)
  }
  assert.ok(existsSync(new URL('../public/player/freshman.png', import.meta.url)))
})
