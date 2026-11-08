import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'

const fields: Record<string, string[]> = {
  get: [], start: ['episodeId', 'choiceId'], buy: ['itemId'],
  input: ['showId', 'sceneId', 'actionId'], next: ['showId', 'sceneId'],
  pause: ['showId'], resume: ['showId'], abandon: ['showId'],
}

Deno.serve((req) => {
 const receivedAt = Date.now()
 return handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const action = typeof body.action === 'string' ? body.action : ''
  if (!Object.hasOwn(fields, action)) throw new GameError('CONCERT_INVALID_ACTION')
  const payload: Record<string, unknown> = {}
  for (const field of fields[action]) {
    const value = body[field]
    if (field === 'episodeId') {
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 5) throw new GameError('CONCERT_INVALID_ACTION')
    } else if (typeof value !== 'string' || !value || value.length > 64) {
      throw new GameError('CONCERT_INVALID_ACTION')
    }
    payload[field] = value
  }
  const { data, error } = await db.rpc('concert_action', {
    p_player_id: player.id, p_action: action, p_payload: payload,
    p_request_id: action === 'get' ? null : requestId(body.requestId),
  })
  rpcError(error)
  return { ...data, player: playerView(data.player), server_processing_ms: Date.now() - receivedAt }
 })
})
