// A delivery queue for UI taps, never a source of rewards or game rules.
// Instances survive leaving the screen; only IDs and unsent taps go to storage.
const sessions = new Map()
const safe = (fn) => { try { return fn() } catch { return null } }

export function createStudioRecorder({ playerId, send, fetchStudio, onResult = () => {}, storage,
  schedule = setTimeout, cancel = clearTimeout, uuid = () => crypto.randomUUID(), now = Date.now }) {
  storage ||= safe(() => globalThis.localStorage)
  const key = `sw_studio_queue:${playerId}`
  const saved = safe(() => JSON.parse(storage?.getItem(key)))
  let pending = Number.isSafeInteger(saved?.pending) && saved.pending >= 0 ? saved.pending : 0
  let batch = saved?.batch && Number.isSafeInteger(saved.batch.taps) && saved.batch.taps > 0 &&
    typeof saved.batch.requestId === 'string' ? saved.batch : null
  let studio = null, player = null, releases = [], error = null, running = false, timer = null, retries = 0
  let version = 0, receivedAt = now()
  const listeners = new Set()
  const persist = () => safe(() => pending || batch
    ? storage?.setItem(key, JSON.stringify({ pending, batch })) : storage?.removeItem(key))
  const snapshot = () => {
    const unconfirmed = pending + (batch?.taps || 0)
    const gain = Math.max(0, Math.floor((now() - receivedAt) / 3000))
    const projected = studio && { ...studio, energy: Math.max(0, Math.min(studio.energy_max, studio.energy + gain) - unconfirmed),
      hype: Math.min(studio.hype_max, studio.hype + unconfirmed) }
    const releasing = Boolean(projected && projected.hype >= projected.hype_max)
    return { studio: projected, player, releases, error, saving: running, releasing,
      canTap: Boolean(projected && projected.energy > 0 && !releasing && !releases.length) }
  }
  const emit = () => { const state = snapshot(); listeners.forEach((listener) => listener(state)) }
  const later = (delay) => { cancel(timer); timer = schedule(() => { timer = null; flush() }, delay) }
  async function load() {
    const started = version
    try {
      const result = await fetchStudio()
      // A read started before an acknowledged write cannot roll the display back.
      if (started !== version || running) return
      studio = result.studio; player = result.player; receivedAt = now(); error = null; emit()
      onResult(result)
      if (batch || pending) flush()
    } catch (e) { error = e; emit() }
  }
  async function flush() {
    if (running || (!batch && !pending)) return
    cancel(timer); timer = null
    if (!batch) { batch = { taps: Math.min(200, pending), requestId: uuid() }; pending -= batch.taps }
    // Persist before sending: a reload after commit must replay the same UUID.
    persist(); running = true; emit()
    try {
      const result = await send(batch.taps, batch.requestId)
      studio = result.studio; player = result.player; receivedAt = now()
      releases = [...releases, ...(result.released || [])]
      batch = null; error = null; retries = 0; version += 1; persist()
      onResult(result)
    } catch (e) {
      error = e
      if (!e?.network && !e?.ambiguous) { batch = null; pending = 0; persist() }
    } finally {
      running = false; emit()
      if (batch) later(Math.min(30_000, 1500 * 2 ** retries++))
      else if (pending) later(0)
      else if (error && !error.network && !error.ambiguous) load()
    }
  }
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
    load,
    flush,
    tick: emit,
    tap() {
      if (!snapshot().canTap) return false
      pending += 1; persist(); emit()
      if (snapshot().releasing) flush()
      else if (!timer && !running) later(250)
      return true
    },
    acknowledgeRelease() { releases = releases.slice(1); emit() },
    // Stop timers in tests; production sessions keep delivering after navigation.
    dispose() { cancel(timer); listeners.clear() },
  }
}

export function studioRecorderFor(playerId, options) {
  if (!sessions.has(playerId)) sessions.set(playerId, createStudioRecorder({ playerId, ...options }))
  return sessions.get(playerId)
}
