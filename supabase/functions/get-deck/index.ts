import { authPlayer, db, handle, mapCard } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  // Все карточки игрока, включая сгоревшие (uses_left: 0).
  const cards = await db.from('player_cards')
    .select('uses_left, card:cards(id,slot,text,theme,themes,rarity,syllables,bonus_type,bonus_value)')
    .eq('player_id', player.id)
  if (cards.error) throw cards.error
  const list = (cards.data || [])
    .map((row: any) => ({ ...mapCard(row.card), slot: row.card.slot, uses_left: row.uses_left }))
    .sort((a: any, b: any) => a.id - b.id)
  return { cards: list }
}))
