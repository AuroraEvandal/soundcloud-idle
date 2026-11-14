import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const beatId = typeof body.beatId === 'string' ? body.beatId : ''
  if (!/^[0-9a-f-]{36}$/i.test(beatId)) throw new GameError('INVALID_REQUEST')
  const { data, error } = await db.rpc('sell_recorded_beat_atomic', {
    p_player_id: player.id, p_beat_id: beatId, p_request_id: requestId(body.requestId),
  })
  rpcError(error)
  return { player: playerView(data.player), beat: data.beat, coins_earned: data.coins_earned }
}))
