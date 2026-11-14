import assert from 'node:assert/strict'
import { test } from 'node:test'
import { equalSecret, paymentOrderId, validCheckout } from '../functions/_shared/paymentValidation.ts'

test('webhook rejects absent/wrong secret and malformed invoice payloads', () => {
  assert.equal(equalSecret(null,undefined),false)
  assert.equal(equalSecret('correct','correct'),true)
  assert.equal(equalSecret('wrong','correct'),false)
  assert.equal(equalSecret('correct-longer','correct'),false)
  assert.equal(paymentOrderId('anything'),null)
  assert.equal(paymentOrderId('case:00000000-0000-4000-8000-000000000011'),'00000000-0000-4000-8000-000000000011')
})
test('pre-checkout permits exactly the pending owner and Stars amount', () => {
  const order = {status:'pending',telegram_id:123,price_stars:29}
  const query = {from:{id:123},currency:'XTR',total_amount:29}
  assert.equal(validCheckout(order,query),true)
  for (const change of [{from:{id:456}},{currency:'USD'},{total_amount:1},{total_amount:'29'}]) {
    assert.equal(validCheckout(order,{...query,...change}),false)
  }
  assert.equal(validCheckout({...order,status:'paid'},query),false)
  assert.equal(validCheckout(null,query),false)
})
