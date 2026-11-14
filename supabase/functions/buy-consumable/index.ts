import { authPlayer, db, GameError, handle, playerView, requestId, rpcError } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (body.itemId !== 'energy_drink') throw new GameError('ITEM_NOT_FOUND')
  const { data, error } = await db.rpc('buy_consumable_atomic', {
    p_player_id: player.id, p_item_id: body.itemId, p_request_id: requestId(body.requestId),
  })
  rpcError(error)
  return { ...data, player: playerView(data.player) }
}))
