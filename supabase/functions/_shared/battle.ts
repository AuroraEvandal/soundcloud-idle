import { db, GameError, mapCard } from './common.ts'

export function battleView(battle: any) {
  const opponent = Array.isArray(battle.opponents) ? battle.opponents[0] : battle.opponents
  const location = Array.isArray(opponent?.locations) ? opponent.locations[0] : opponent?.locations
  return {
    id: battle.id,
    status: battle.status,
    ...(battle.result ? { result: battle.result } : {}),
    opponent: {
      id: opponent?.id,
      name: opponent?.name,
      style: opponent?.style || '',
      level: opponent?.level,
      // Только для отображения в арене (docs/api.md, start-battle)
      ...(battle.opponent_outfit ? { outfit: battle.opponent_outfit } : {}),
    },
    player_rounds_won: battle.player_rounds_won,
    opponent_rounds_won: battle.opponent_rounds_won,
  }
}

// Случайная одежда соперника из всей библиотеки (включая вещи «только из паков»).
// Бонусов у неё нет и в расчёты она не входит. Минимум три вещи, чтобы соперник
// не выходил на сцену совсем раздетым.
export async function randomOpponentOutfit() {
  const cl = await db.from('clothing').select('id,name,image_url,slot')
  if (cl.error) throw cl.error
  const bySlot: Record<string, any[]> = {}
  for (const c of cl.data || []) (bySlot[c.slot] ||= []).push(c)
  const slots = ['hat', 'hoodie', 'pants', 'shoe', 'chain']
  const pick = (slot: string) => {
    const list = bySlot[slot] || []
    return list.length ? list[Math.floor(Math.random() * list.length)] : null
  }
  const out: Record<string, { id: number; name: string; image: string } | null> = {}
  for (const slot of slots) out[slot] = Math.random() < 0.8 ? pick(slot) : null
  for (const slot of slots) {
    if (Object.values(out).filter(Boolean).length >= 3) break
    if (!out[slot]) out[slot] = pick(slot)
  }
  return out
}

export async function readBattle(playerId: string, battleId: string) {
  const { data: battle, error } = await db.from('battles')
    .select('*, opponents(id,name,style,level,locations(name,required_popularity))')
    .eq('id', battleId).eq('player_id', playerId).maybeSingle()
  if (error) throw error
  if (!battle) throw new GameError('BATTLE_NOT_FOUND', 404)

  const { data: rounds, error: roundsError } = await db.from('rounds')
    .select('round_number,result_payload')
    .eq('battle_id', battle.id).order('round_number', { ascending: false }).limit(1)
  if (roundsError) throw roundsError

  // uses_left лежит в player_cards, поэтому читаем руку через неё
  const cards = battle.status === 'active' && battle.current_hand?.length
    ? await db.from('player_cards')
      .select('uses_left, card:cards(id,text,slot,theme,themes,rarity,syllables,bonus_type,bonus_value)')
      .eq('player_id', playerId).in('card_id', battle.current_hand)
    : { data: [], error: null }
  if (cards.error) throw cards.error
  const byId = new Map((cards.data || []).map((row: any) => [row.card.id, { ...row.card, uses_left: row.uses_left }]))
  const hand: Record<string, unknown[]> = { setup: [], development: [], boost: [], punch: [] }
  for (const id of battle.current_hand || []) {
    const card = byId.get(id) as Record<string, unknown> | undefined
    if (card && typeof card.slot === 'string' && card.slot in hand) hand[card.slot].push(mapCard(card))
  }
  const lastResult = rounds?.[0]?.result_payload || null
  const active = battle.status === 'active'
  return {
    battle: battleView(battle),
    round: active ? { number: battle.current_round, theme: battle.themes[battle.current_round - 1] } : null,
    cards: active ? hand : null,
    last_result: lastResult,
  }
}
