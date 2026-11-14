import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDayDelivery } from '../src/dayDelivery.js'

test('lost night response replays the original day and UUID after a full reload',async()=>{
  const values=new Map(), calls=[]
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
  const first=createDayDelivery(async request=>{ calls.push(request); throw {network:true} },()=>storage)
  await assert.rejects(first.run('player',3,1))
  const reloaded=createDayDelivery(async request=>{ calls.push(request); return {report:{next_day:4}} },()=>storage)
  // Login already sees day 4. Replaying still acknowledges night 3, never night 4.
  assert.equal((await reloaded.run('player',4,1)).report.next_day,4)
  assert.deepEqual(calls[0],calls[1]); assert.equal(calls[1].dayId,3)
  assert.equal(reloaded.pending('player'),null)
  await reloaded.run('player',4,1)
  assert.notEqual(calls[2].requestId,calls[0].requestId)
})

test('definite day rejection clears delivery state; other players are isolated',async()=>{
  const delivery=createDayDelivery(async()=>{ throw {code:'DAY_CHANGED'} },()=>null)
  await assert.rejects(delivery.run('a',1,1))
  assert.equal(delivery.pending('a'),null)
  assert.equal(delivery.pending('b'),null)
})
