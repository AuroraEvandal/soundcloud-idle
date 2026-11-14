// Shared by the timing display and the local mock; production adjudication is SQL.
export const timingDuration = (hits = 0) => [1200, 1000, 2100][Math.min(hits, 2)]

export function timingPosition(elapsed, hits = 0, path = []) {
  const fraction = Math.max(0, Math.min(1, elapsed / timingDuration(hits)))
  if (hits === 0) return fraction
  if (hits === 1) return 1 - fraction
  const index = Math.min(6, Math.floor(fraction * 7))
  const start = path[index] ?? 0
  return start + ((path[index + 1] ?? 1) - start) * (fraction * 7 - index)
}

export const timingPath = () => Array.from({ length: 8 }, (_, i) =>
  i % 2 ? .75 + Math.random() * .2 : .05 + Math.random() * .2)

export function miniGameClockOffset(response, sent, received) {
  const roundTrip = received - sent
  const processing = response.server_processing_ms ?? (response.kind === 'timing' ? roundTrip : 0)
  return response.server_now - received + Math.min(250, Math.max(0, roundTrip - processing) / 2)
}
