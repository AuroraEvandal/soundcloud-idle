import { authPlayer, db, GameError, handle, playerView, rpcError } from '../_shared/common.ts'
import { clothingView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const kind = body.kind
  const itemId = Number(body.itemId)
  if (kind !== 'equipment' && kind !== 'clothing') throw new GameError('ITEM_NOT_FOUND')
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new GameError('ITEM_NOT_FOUND')
  // Списание монет и выдача предмета — одна транзакция в базе (docs/api.md, buy-item).
  rpcError((await db.rpc('purchase_item', { p_player_id: player.id, p_kind: kind, p_item_id: itemId })).error)

  const [fresh, item] = await Promise.all([
    db.from('players').select('*').eq('id', player.id).single(),
    kind === 'equipment'
      ? db.from('equipment').select('id,name,price,bonus_type,bonus_value').eq('id', itemId).maybeSingle()
      : db.from('clothing')
        .select('id,slot,name,rarity,price,image_url,thumb_url,description,bonus_type,bonus_value')
        .eq('id', itemId).maybeSingle(),
  ])
  if (fresh.error) throw fresh.error
  if (item.error) throw item.error
  if (!item.data) throw new GameError('ITEM_NOT_FOUND')
  return {
    player: playerView(fresh.data),
    item: kind === 'equipment'
      ? { id: item.data.id, name: item.data.name, price: item.data.price, bonus: { type: item.data.bonus_type, value: item.data.bonus_value }, owned: true }
      : clothingView(item.data, true),
  }
}))
