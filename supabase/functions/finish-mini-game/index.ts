import { authPlayer, db, GameError, handle, requestId, rpcError } from '../_shared/common.ts'

Deno.serve((req) => {
  const receivedAt = Date.now()
  return handle(req, async (body) => {
    const { player } = await authPlayer(body)
    const battleId = requestId(body.battleId)
    const gameId = requestId(body.miniGameId)
    if (typeof body.actionId !== 'string' || body.actionId.length > 36) throw new GameError('INVALID_MINI_GAME_ACTION')
    const result = await db.rpc('mini_game_finish', {
      p_player_id: player.id, p_battle_id: battleId, p_game_id: gameId, p_action_id: body.actionId,
    })
    rpcError(result.error)
    return { ...result.data, server_processing_ms: Date.now() - receivedAt }
  })
})
