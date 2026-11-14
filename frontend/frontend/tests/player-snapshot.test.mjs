import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptPlayerSnapshot } from '../src/playerSnapshot.js'

test('late replies from yesterday or a reset run cannot restore old displayed resources',()=>{
  const current={id:'a',game_run:2,game_day:1,coins:300}
  assert.equal(acceptPlayerSnapshot(current,{...current,game_run:1,game_day:20,coins:999}),current)
  const tomorrow={...current,game_day:2}
  assert.equal(acceptPlayerSnapshot(tomorrow,current),tomorrow)
  assert.equal(acceptPlayerSnapshot(current,{id:'a',coins:999}),current)
  const updated={...current,coins:200}
  assert.equal(acceptPlayerSnapshot(current,updated),updated)
})
