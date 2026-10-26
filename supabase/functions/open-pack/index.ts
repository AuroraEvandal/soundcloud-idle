import { authPlayer, db, GameError, handle, playerView, rpcError } from '../_shared/common.ts'
import { clothingView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const packId = Number(body.packId)
  if (!Number.isSafeInteger(packId) || packId <= 0) throw new GameError('ITEM_NOT_FOUND')
  // Списание монет и ролл — одна транзакция в базе (open_pack_atomic).
  // Возврат: { type: 'card'|'clothing', card_id?|item_id?, duplicate, refund }.
  const rolled = await db.rpc('open_pack_atomic', { p_player_id: player.id, p_pack_id: packId })
  rpcError(rolled.error)
  const drop = rolled.data as Record<string, any>

  const [fresh, cardRow, itemRow] = await Promise.all([
    db.from('players').select('*').eq('id', player.id).single(),
    drop.type === 'card'
      ? db.from('cards').select('id,text,slot,theme,rarity,syllables,bonus_type,bonus_value').eq('id', drop.card_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    drop.type === 'clothing'
      ? db.from('clothing')
        .select('id,slot,name,rarity,price,image_url,thumb_url,description,bonus_type,bonus_value')
        .eq('id', drop.item_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ])
  if (fresh.error) throw fresh.error
  if (cardRow.error) throw cardRow.error
  if (itemRow.error) throw itemRow.error

  let dropView: Record<string, any>
  if (drop.type === 'card') {
    if (!cardRow.data) throw new GameError('ITEM_NOT_FOUND')
    const c = cardRow.data
    // Новая карточка и починенный дубликат приходят с полным запасом боёв.
    dropView = {
      type: 'card',
      card: {
        id: c.id,
        slot: c.slot,
        text: c.text,
        theme: c.theme,
        rarity: c.rarity,
        syllables: c.syllables,
        uses_left: 3,
        ...(c.bonus_type ? { bonus: { type: c.bonus_type, value: c.bonus_value } } : {}),
      },
      duplicate: !!drop.duplicate,
      refund: Number(drop.refund || 0),
    }
  } else {
    if (!itemRow.data) throw new GameError('ITEM_NOT_FOUND')
    dropView = { type: 'clothing', item: clothingView(itemRow.data, true), duplicate: false, refund: 0 }
  }
  return { player: playerView(fresh.data), drop: dropView }
}))
