import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'
import { studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  let taps = Number(body.taps)
  if (!Number.isSafeInteger(taps) || taps < 1) throw new GameError('INVALID_REQUEST')
  // Backward-compatible during the frontend rollout; new clients always send requestId.
  const id = body.requestId == null ? crypto.randomUUID() : requestId(body.requestId)
  const result = await db.rpc('record_snippet_atomic', {
    p_player_id: player.id,
    p_request_id: id,
    p_taps: Math.min(taps, 200),
  })
  rpcError(result.error)
  const payload = result.data as Record<string, any>
  return {
    player: playerView(payload.player),
    studio: await studioView(payload.player, payload.bonuses),
    released: payload.released,
  }
}))
