// Persist delivery IDs only. Balances, rewards and authorisation stay on the server.
export function createOperationIds(getStorage = () => globalThis.localStorage) {
  const memory = new Map()
  const safe = (fn) => { try { return fn() } catch { return null } }
  const storageKey = (key) => `sw_request_v1:${key}`
  return {
    read(key) {
      const value = memory.get(key) || safe(() => getStorage()?.getItem(storageKey(key)))
      return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null
    },
    remember(key, value) { memory.set(key,value); safe(() => getStorage()?.setItem(storageKey(key),value)) },
    forget(key) { memory.delete(key); safe(() => getStorage()?.removeItem(storageKey(key))) },
  }
}
export const operationIds = createOperationIds()
