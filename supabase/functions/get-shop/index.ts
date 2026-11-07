import { authPlayer, db, handle, playerView } from '../_shared/common.ts'
import { clothingView } from '../_shared/studio.ts'
import { packView } from '../_shared/packView.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const [equipment, clothing, packs, ownedEq, ownedCl, balance, cards] = await Promise.all([
    db.from('equipment').select('id,name,price,bonus_type,bonus_value').order('id'),
    db.from('clothing')
      .select('id,slot,name,rarity,price,image_url,thumb_url,description,bonus_type,bonus_value')
      .order('id'),
    db.from('packs').select('id,name,price,clothing_chance,card_slot,common_weight,rare_weight,epic_weight').order('id'),
    db.from('player_equipment').select('equipment_id').eq('player_id', player.id),
    db.from('player_clothing').select('clothing_id').eq('player_id', player.id),
    db.from('game_balance').select('common_weight,rare_weight,epic_weight').eq('id', true).single(),
    db.from('cards').select('slot,rarity'),
  ])
  for (const e of [equipment, clothing, packs, ownedEq, ownedCl, balance, cards]) if (e.error) throw e.error
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
    clothing: (clothing.data || []).filter((c: any) => c.price != null).map((c: any) => clothingView(c, clOwned.has(c.id))),
    packs: (packs.data || []).map((p: any) => packView(p, balance.data!, cards.data || [],
      (clothing.data || []).some((c: any) => !clOwned.has(c.id)))),
  }
}))
