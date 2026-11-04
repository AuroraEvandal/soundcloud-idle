import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'
import { studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const taps = Number(body.taps)
  if (!Number.isSafeInteger(taps) || taps < 1 || taps > 2147483647) throw new GameError('INVALID_REQUEST')
  const { data, error } = await db.rpc('record_snippet_atomic', {
    p_player_id: player.id, p_taps: taps,
    p_request_id: body.requestId == null ? crypto.randomUUID() : requestId(body.requestId),
  })
  rpcError(error)
  return { player: playerView(data.player), studio: await studioView(data.player), released: data.released }
}))
