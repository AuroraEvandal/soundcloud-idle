import { db } from './common.ts'

// Числа согласованы в docs/api.md «Экономика» и docs/game-design.md раздел 8.
export const ENERGY_MAX = 100
export const ENERGY_REGEN_MS = 3000
export const HYPE_MAX = 20
export const MAX_TAPS_PER_REQUEST = 200

// income_pct / popularity_pct / charisma: купленное оборудование + надетая одежда.
export async function bonusPct(playerId: string) {
  const [equipment, outfit] = await Promise.all([
    db.from('player_equipment').select('item:equipment_id(bonus_type,bonus_value)').eq('player_id', playerId),
    db.from('player_outfit').select('item:clothing_id(bonus_type,bonus_value)').eq('player_id', playerId),
  ])
  if (equipment.error) throw equipment.error
  if (outfit.error) throw outfit.error
  const sum = (type: string) =>
    [...(equipment.data || []), ...(outfit.data || [])].reduce((n, row: any) => {
      const b = row.item
      return b?.bonus_type === type ? n + Number(b.bonus_value) : n
    }, 0)
  return { income_pct: sum('income_pct'), popularity_pct: sum('popularity_pct'), charisma: sum('charisma') }
}

// Энергия восстанавливается временем на сервере (+1 за 3 с, максимум 100).
// Пока запас полон, «перелив» не копим — просто фиксируем момент.
export async function refreshEnergy(player: Record<string, any>) {
  const now = Date.now()
  const last = new Date(player.energy_updated_at).getTime()
  if (Number(player.energy) >= ENERGY_MAX) {
    if (last > now - ENERGY_REGEN_MS) return player
    const upd = await db.from('players')
      .update({ energy_updated_at: new Date(now).toISOString() })
      .eq('id', player.id).select('*').single()
    if (upd.error) throw upd.error
    return upd.data
  }
  const gain = Math.floor((now - last) / ENERGY_REGEN_MS)
  if (gain <= 0) return player
  const energy = Math.min(ENERGY_MAX, Number(player.energy) + gain)
  const upd = await db.from('players')
    .update({
      energy,
      // запас стал полным — точка отсчёта сбрасывается на сейчас, иначе частично
      energy_updated_at: new Date(energy >= ENERGY_MAX ? now : last + gain * ENERGY_REGEN_MS).toISOString(),
    })
    .eq('id', player.id).select('*').single()
  if (upd.error) throw upd.error
  return upd.data
}

// Один релиз сниппета. Множитель от популярности упирается в ×3 (после 400 фанатов),
// прирост фанатов за релиз — не больше +25 (docs/api.md, record-snippet).
export function releaseRewards(baseStreams: number, popularity: number, incomePct: number, popularityPct: number) {
  const streams = Math.round(baseStreams * (1 + Math.min(popularity, 400) / 200) * (1 + incomePct / 100))
  const coins = Math.round(streams / 10)
  const popularity_change = Math.min(25, Math.max(1, Math.round((streams / 100) * (1 + popularityPct / 100))))
  return { streams, coins, popularity_change }
}

// Вид студии для ответов get-studio / record-snippet / select-beat / buy-beat.
export async function studioView(player: Record<string, any>, cachedBonuses?: Record<string, number>) {
  const [bonuses, beats, equipment, ownedBeats, ownedEquipment] = await Promise.all([
    cachedBonuses ? Promise.resolve(cachedBonuses) : bonusPct(player.id),
    db.from('beats').select('id,name,base_streams,price').order('id'),
    db.from('equipment').select('id,name,price,bonus_type,bonus_value').order('id'),
    db.from('player_beats').select('beat_id').eq('player_id', player.id),
    db.from('player_equipment').select('equipment_id').eq('player_id', player.id),
  ])
  for (const e of [beats, equipment, ownedBeats, ownedEquipment]) if (e.error) throw e.error
  const beatsOwned = new Set((ownedBeats.data || []).map((r: any) => r.beat_id))
  const eqOwned = new Set((ownedEquipment.data || []).map((r: any) => r.equipment_id))
  return {
    hype: Number(player.hype || 0),
    hype_max: HYPE_MAX,
    energy: Number(player.energy || 0),
    energy_max: ENERGY_MAX,
    selected_beat_id: player.selected_beat_id,
    income_pct: bonuses.income_pct,
    beats: (beats.data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      base_streams: b.base_streams,
      price: b.price,
      owned: b.price === 0 || beatsOwned.has(b.id),
    })),
    equipment: (equipment.data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      price: e.price,
      bonus: { type: e.bonus_type, value: e.bonus_value },
      owned: eqOwned.has(e.id),
    })),
  }
}

// Одежда: те же поля, что в get-shop (docs/api.md раздел 10).
export function clothingView(c: Record<string, any>, owned: boolean) {
  return {
    id: c.id,
    slot: c.slot,
    name: c.name,
    rarity: c.rarity,
    ...(c.price != null ? { price: c.price } : {}),
    image: c.image_url,
    thumb: c.thumb_url,
    ...(c.description ? { description: c.description } : {}),
    ...(c.bonus_type ? { bonus: { type: c.bonus_type, value: c.bonus_value } } : {}),
    owned,
  }
}
