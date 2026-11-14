export function equalSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false
  const a = new TextEncoder().encode(actual)
  const b = new TextEncoder().encode(expected)
  let mismatch = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return mismatch === 0
}

export function paymentOrderId(payload: unknown) {
  if (typeof payload !== 'string' || !/^case:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload)) return null
  return payload.slice(5)
}

export function validCheckout(order: Record<string, any> | null, query: Record<string, any>) {
  return !!order && order.status === 'pending' && Number.isSafeInteger(query.from?.id)
    && String(query.from.id) === String(order.telegram_id) && query.currency === 'XTR'
    && Number.isSafeInteger(query.total_amount) && query.total_amount === order.price_stars
}
