import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOperationIds } from '../src/operationIds.js'

test('delivery IDs survive reloads, are scoped to the player/action and clear after confirmation', () => {
  const values = new Map()
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
  const key = '41:open-pack:{"packId":1}', id = crypto.randomUUID()
  createOperationIds(() => storage).remember(key,id)
  const reloaded = createOperationIds(() => storage)
  assert.equal(reloaded.read(key),id)
  assert.equal(reloaded.read('42:open-pack:{"packId":1}'),null)
  reloaded.forget(key)
  assert.equal(createOperationIds(() => storage).read(key),null)
})

test('blocked storage still permits retries in memory', () => {
  const cache = createOperationIds(() => { throw new Error('blocked') })
  const id = crypto.randomUUID()
  cache.remember('action',id)
  assert.equal(cache.read('action'),id)
  cache.forget('action')
  assert.equal(cache.read('action'),null)
})
