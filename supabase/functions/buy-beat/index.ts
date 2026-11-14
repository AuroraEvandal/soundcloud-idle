import { authPlayer, db, GameError, handle, playerView, rpcError } from '../_shared/common.ts'
import { refreshEnergy, studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const beatId = Number(body.beatId)
  if (!Number.isSafeInteger(beatId) || beatId <= 0) throw new GameError('ITEM_NOT_FOUND')
  // Покупка и выбор бита — одна атомарная операция в базе (миграция 20261026120000).
  rpcError((await db.rpc('purchase_item', { p_player_id: player.id, p_kind: 'beat', p_item_id: beatId })).error)
  const freshRow = await db.from('players').select('*').eq('id', player.id).single()
  if (freshRow.error) throw freshRow.error
  const fresh = await refreshEnergy(freshRow.data)
  return { player: playerView(fresh), studio: await studioView(fresh) }
}))
