// Delivery metadata only. Days, energy, randomness and debt are server-owned.
export function createDayDelivery(send, getStorage = () => globalThis.localStorage) {
  const memory = new Map()
  const safe = fn => { try { return fn() } catch { return null } }
  const key = scope => `sw_day_pending_v1:${scope}`
  function pending(scope) {
    const saved = memory.get(scope) || safe(() => JSON.parse(getStorage()?.getItem(key(scope))))
    return Number.isSafeInteger(saved?.dayId) && saved.dayId > 0 &&
      Number.isSafeInteger(saved?.runId) && saved.runId > 0 &&
      typeof saved?.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestId) ? saved : null
  }
  return {
    pending,
    async run(scope, dayId, runId) {
      const request = pending(scope) || { dayId, runId, requestId: crypto.randomUUID() }
      memory.set(scope, request)
      safe(() => getStorage()?.setItem(key(scope), JSON.stringify(request)))
      const clear = () => { memory.delete(scope); safe(() => getStorage()?.removeItem(key(scope))) }
      try {
        const result = await send(request)
        clear()
        return result
      } catch (error) {
        if (!error?.network && !error?.ambiguous) clear()
        throw error
      }
    },
  }
}
