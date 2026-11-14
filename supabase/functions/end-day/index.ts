import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (!Number.isSafeInteger(body.dayId) || Number(body.dayId) < 1 ||
      !Number.isSafeInteger(body.runId) || Number(body.runId) < 1) throw new GameError('INVALID_REQUEST')
  const { data, error } = await db.rpc('end_game_day', {
    p_player_id: player.id, p_day_id: body.dayId, p_run_id: body.runId,
    p_request_id: requestId(body.requestId),
  })
  rpcError(error)
  return { ...data, player: playerView(data.player) }
}))
