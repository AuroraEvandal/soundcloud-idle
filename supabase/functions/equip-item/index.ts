import { authPlayer, db, GameError, handle, playerView } from '../_shared/common.ts'
import { bonusPct } from '../_shared/studio.ts'

const SLOTS = ['hat', 'hoodie', 'pants', 'shoe', 'chain']

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const slot = body.slot
  // itemId: null снимает вещь со слота (docs/api.md, equip-item).
  const itemId = body.itemId == null ? null : Number(body.itemId)
  if (typeof slot !== 'string' || !SLOTS.includes(slot)) throw new GameError('ITEM_NOT_FOUND')
  if (itemId != null) {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new GameError('ITEM_NOT_FOUND')
    const item = await db.from('clothing').select('id,slot').eq('id', itemId).maybeSingle()
    if (item.error) throw item.error
    if (!item.data || item.data.slot !== slot) throw new GameError('ITEM_NOT_FOUND')
    const owned = await db.from('player_clothing').select('clothing_id').eq('player_id', player.id).eq('clothing_id', itemId).maybeSingle()
    if (owned.error) throw owned.error
    if (!owned.data) throw new GameError('NOT_OWNED')
  }
  const upd = await db.from('player_outfit').upsert({ player_id: player.id, slot, clothing_id: itemId })
  if (upd.error) throw upd.error

  const outfitRow = await db.from('player_outfit').select('slot,clothing_id').eq('player_id', player.id)
  if (outfitRow.error) throw outfitRow.error
  const outfitMap: Record<string, number | null> = { hat: null, hoodie: null, pants: null, shoe: null, chain: null }
  for (const row of outfitRow.data || []) if (row.slot in outfitMap) outfitMap[row.slot] = row.clothing_id
  return { player: playerView(player), outfit: outfitMap, bonuses: await bonusPct(player.id) }
}))
