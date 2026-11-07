import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { initialComposition } from '../src/beatAudio.js'
import { readDraft, draftKey } from '../src/beatDraft.js'
import { composedBeat } from './fixtures/beat.mjs'

const original=globalThis.localStorage
afterEach(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original})
const storage=entries=>{const data=new Map(entries);globalThis.localStorage={getItem:key=>data.get(key)??null};return data}
const legacyPreset={genre:'plugg',bpm:150,key:2,scale:'minor',pattern:{drums:{kick:[0,8,16,24],snare:[4,12,20,28],hihat:[0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]},piano:[{step:0,note:12},{step:16,note:15}],melody:[{step:4,note:19},{step:20,note:17}]}}

test('new players and invalid/unavailable storage start with empty lanes',()=>{
  storage([]);assert.deepEqual(readDraft('new'),initialComposition())
  storage([[draftKey('new'),'broken json']]);assert.deepEqual(readDraft('new'),initialComposition())
  globalThis.localStorage={getItem(){throw Error('blocked')}};assert.deepEqual(readDraft('new'),initialComposition())
})
test('only the untouched old automatic pattern is removed, preserving its sound settings',()=>{
  storage([['sw_beat_draft:old',JSON.stringify(legacyPreset)]])
  assert.deepEqual(readDraft('old'),{...legacyPreset,pattern:initialComposition().pattern})
})
test('existing authored drafts and their notes survive the migration',()=>{
  const draft=composedBeat()
  storage([['sw_beat_draft:old',JSON.stringify(draft)]])
  assert.deepEqual(readDraft('old'),draft)
})
test('new drafts take precedence and are never mistaken for an automatic preset',()=>{
  storage([[draftKey('old'),JSON.stringify(legacyPreset)],['sw_beat_draft:old',JSON.stringify(composedBeat())]])
  assert.deepEqual(readDraft('old'),legacyPreset)
})
