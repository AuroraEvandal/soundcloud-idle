import { authPlayer, db, handle, playerView } from '../_shared/common.ts'
import { clothingView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const [equipment, clothing, packs, ownedEq, ownedCl] = await Promise.all([
    db.from('equipment').select('id,name,price,bonus_type,bonus_value').order('id'),
    db.from('clothing')
      .select('id,slot,name,rarity,price,image_url,thumb_url,description,bonus_type,bonus_value')
      .not('price', 'is', null).order('id'),
    db.from('packs').select('id,name,price').order('id'),
    db.from('player_equipment').select('equipment_id').eq('player_id', player.id),
    db.from('player_clothing').select('clothing_id').eq('player_id', player.id),
  ])
  for (const e of [equipment, clothing, packs, ownedEq, ownedCl]) if (e.error) throw e.error
  const eqOwned = new Set((ownedEq.data || []).map((r: any) => r.equipment_id))
  const clOwned = new Set((ownedCl.data || []).map((r: any) => r.clothing_id))
  return {
    player: playerView(player),
    equipment: (equipment.data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      price: e.price,
      bonus: { type: e.bonus_type, value: e.bonus_value },
      owned: eqOwned.has(e.id),
    })),
    clothing: (clothing.data || []).map((c: any) => clothingView(c, clOwned.has(c.id))),
    packs: packs.data || [],
  }
}))
