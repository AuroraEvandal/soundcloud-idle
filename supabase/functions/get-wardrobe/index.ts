import { authPlayer, db, handle, playerView } from '../_shared/common.ts'
import { bonusPct, clothingView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const [items, outfit, bonuses] = await Promise.all([
    db.from('player_clothing')
      .select('item:clothing_id(id,slot,name,rarity,price,image_url,thumb_url,description,bonus_type,bonus_value)')
      .eq('player_id', player.id).order('acquired_at'),
    db.from('player_outfit').select('slot,clothing_id').eq('player_id', player.id),
    bonusPct(player.id),
  ])
  if (items.error) throw items.error
  if (outfit.error) throw outfit.error

  const outfitMap: Record<string, number | null> = { hat: null, hoodie: null, pants: null, shoe: null, chain: null }
  for (const row of outfit.data || []) if (row.slot in outfitMap) outfitMap[row.slot] = row.clothing_id
  return {
    player: playerView(player),
    items: (items.data || []).map((r: any) => clothingView(r.item, true)),
    outfit: outfitMap,
    bonuses,
  }
}))
