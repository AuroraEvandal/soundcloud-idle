// Response ordering for the interface. Game rules remain on the server.
export function acceptPlayerSnapshot(current, incoming) {
  if (!incoming) return current
  if (current?.id !== incoming.id || current.game_run == null) return incoming
  if (incoming.game_run == null || incoming.game_day == null) return current
  if (incoming.game_run < current.game_run ||
      (incoming.game_run === current.game_run && incoming.game_day < current.game_day)) return current
  return incoming
}
