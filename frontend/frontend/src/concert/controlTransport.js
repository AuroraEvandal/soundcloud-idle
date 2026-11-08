export const clampControl = value => Math.max(0, Math.min(100, value))

// This is a visual guide; only the server measures a successful hold.
export function targetPosition(event, seconds) {
  return clampControl(event.target + (event.moving ? Math.sin(seconds * 1000 / 650) * event.amplitude : 0))
}

export function controlAction(kind, value) {
  return `${kind === 'frequency' ? 'dial' : 'fader'}-${Math.round(clampControl(value))}`
}

export function createControlStream(send, clock = globalThis) {
  let action, timer, running = false, busy = false
  async function tick() {
    if (!running || busy || !action) return
    busy = true
    try { await send(action) }
    catch { /* The parent displays request errors. Keep the next sample available. */ }
    finally { busy = false }
  }
  return {
    update(next) {
      action = next
      if (running) return
      running = true
      tick()
      timer = clock.setInterval(tick, 300)
    },
    stop() {
      running = false
      clock.clearInterval(timer)
    },
  }
}
