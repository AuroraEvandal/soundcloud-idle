// Serialise server actions; an uncertain mutation must be retried before a new one.
export function concertClock(response) {
  const s = response.show
  const moving = s?.status === 'active' && !s.paused && !s.outcomes?.[s.events?.[s.scene_index]?.id]
  const delay = moving ? Math.min(250, Math.max(0, (response.client_rtt_ms || 0) - (response.server_processing_ms || 0)) / 2) : 0
  return { elapsed: ((s?.elapsed_ms || 0) + delay) / 1000, scene: ((s?.scene_elapsed_ms || 0) + delay) / 1000 }
}

export function createConcertSession(send, onState, getStorage = () => globalThis.localStorage) {
  const safe = fn => { try { return fn() } catch { return null } }
  const scope = safe(() => globalThis.window?.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 'session'
  const key = `sw_concert_pending_v1:${scope}`
  const saved = safe(() => JSON.parse(getStorage()?.getItem(key) || 'null'))
  let pending = saved && ['start', 'buy', 'input', 'next', 'pause', 'resume', 'abandon'].includes(saved.action)
    && saved.body && typeof saved.body === 'object' && !Array.isArray(saved.body)
    && typeof saved.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.requestId) ? saved : null
  let tail = Promise.resolve(), restoring = Boolean(pending)
  const clear = command => {
    pending = null; restoring = false
    if (command.action !== 'get') safe(() => {
      const storage = getStorage()
      if (JSON.parse(storage?.getItem(key) || 'null')?.requestId === command.requestId) storage?.removeItem(key)
    })
  }
  async function deliver(command) {
    pending = command
    if (command.action !== 'get') safe(() => getStorage()?.setItem(key, JSON.stringify(command)))
    let response
    try {
      response = await send(command.action, command.action === 'get' ? command.body : { ...command.body, requestId: command.requestId })
    } catch (error) {
      if (error?.code && !error.network && !error.ambiguous && error.code !== 'INTERNAL') clear(command)
      throw error
    }
    clear(command)
    onState(response)
    return response
  }
  function execute(command) {
    const task = tail.catch(() => {}).then(async () => {
      if (restoring && command.action === 'get' && pending !== command) {
        restoring = false
        try { await deliver(pending) }
        catch (error) { if (pending) throw error }
      }
      if (pending && pending !== command) throw new Error('CONCERT_RETRY_REQUIRED')
      return deliver(command)
    })
    tail = task
    return task
  }
  return {
    run(action, body = {}) { return execute({ action, body: { ...body }, requestId: action === 'get' ? null : crypto.randomUUID() }) },
    retry() { return execute(pending || { action: 'get', body: {} }) },
  }
}
