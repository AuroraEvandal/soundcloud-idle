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
    },
    player_rounds_won: battle.player_rounds_won,
    opponent_rounds_won: battle.opponent_rounds_won,
  }
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

  const cards = battle.status === 'active' && battle.current_hand?.length
    ? await db.from('cards').select('id,text,slot,theme,rarity,syllables,bonus_type,bonus_value').in('id', battle.current_hand)
    : { data: [], error: null }
  if (cards.error) throw cards.error
  const byId = new Map((cards.data || []).map((c: any) => [c.id, c]))
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
