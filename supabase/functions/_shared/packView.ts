type Weights = { common_weight: number | string | null; rare_weight: number | string | null; epic_weight: number | string | null }
type Pack = Weights & { id: number; name: string; price: number; clothing_chance: number | string; card_slot: string | null }
type Card = { slot: string; rarity: string }

const slots: Record<string, string> = { setup: 'завязка', development: 'развитие', boost: 'усиление', punch: 'панч' }
const rarities = ['common', 'rare', 'epic'] as const
const percent = (value: number) => Number(value.toFixed(8))

// The same category weights and available-card filters as open_pack_atomic.
// Percentages include clothing's earlier roll and this player's owned clothing.
export function packView(pack: Pack, balance: Weights, cards: Card[], hasUnownedClothing: boolean) {
  const pool = cards.filter((c) => !pack.card_slot || c.slot === pack.card_slot)
  const weights = rarities.map((r) => pool.some((c) => c.rarity === r)
    ? Number(pack[`${r}_weight`] ?? balance[`${r}_weight`]) : 0)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const clothing = !pack.card_slot && hasUnownedClothing ? percent(Number(pack.clothing_chance) * 100) : 0
  const description = pack.card_slot
    ? `Только карточка слота «${slots[pack.card_slot]}». Без одежды.`
    : pack.id === 2
      ? 'Карточка любого слота с повышенным шансом редкой и эпической. Может выпасть одежда.'
      : 'Карточка любого слота или предмет одежды. Для пополнения колоды.'
  return {
    id: pack.id, name: pack.name, price: pack.price, description,
    drop_chances: total > 0 ? {
      common: percent((100 - clothing) * weights[0] / total),
      rare: percent((100 - clothing) * weights[1] / total),
      epic: percent((100 - clothing) * weights[2] / total),
      clothing,
    } : null,
  }
}
