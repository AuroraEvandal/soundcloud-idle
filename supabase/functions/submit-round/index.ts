import { authPlayer, db, GameError, handle, requestId, rpcError } from '../_shared/common.ts'
import { scoreRound, type ThemeRelations } from '../_shared/scoring.ts'

let relationCache: { expiresAt: number; rows: { theme_a: string; theme_b: string; strength: number }[] } | null = null
let relationLoad: Promise<{ theme_a: string; theme_b: string; strength: number }[]> | null = null

function loadThemeRelations() {
  if (relationCache && relationCache.expiresAt > Date.now()) return Promise.resolve(relationCache.rows)
  if (!relationLoad) {
    relationLoad = (async () => {
      const result = await db.from('theme_relations').select('theme_a,theme_b,strength')
      if (result.error) throw result.error
      const rows = result.data as { theme_a: string; theme_b: string; strength: number }[]
      relationCache = { rows, expiresAt: Date.now() + 60_000 }
      return rows
    })().finally(() => { relationLoad = null })
  }
  return relationLoad
}

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (typeof body.battleId !== 'string') throw new GameError('BATTLE_NOT_FOUND', 404)
  const roundNumber = Number(body.roundNumber)
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1 || roundNumber > 3) throw new GameError('INVALID_ROUND')
  const request_id = requestId(body.requestId)
  const cardIds = body.cardIds
  if (!Array.isArray(cardIds) || cardIds.length !== 4 || cardIds.some((id) => !Number.isSafeInteger(id)) || new Set(cardIds).size !== 4) {
    throw new GameError('INVALID_CARDS')
  }

  const battleQuery = await db.from('battles')
    .select('id,player_id,opponent_id,status,current_round,current_hand,themes,opponents(level)')
    .eq('id', body.battleId).eq('player_id', player.id).maybeSingle()
  if (battleQuery.error) throw battleQuery.error
  const battle = battleQuery.data
  if (!battle) throw new GameError('BATTLE_NOT_FOUND', 404)

  // These reads are independent after the battle has been loaded.
  const [prior, reused, cardsResult, owned, relationsQuery] = await Promise.all([
    db.from('rounds').select('request_id,card_ids,result_payload')
      .eq('battle_id', battle.id).eq('round_number', roundNumber).maybeSingle(),
    db.from('rounds').select('battle_id,round_number,card_ids').eq('request_id', request_id).maybeSingle(),
    db.from('cards').select('id,text,slot,theme,themes,rarity,syllables,rhyme_group,bonus_type,bonus_value').in('id', cardIds),
    db.from('player_cards').select('card_id,uses_left').eq('player_id', player.id).in('card_id', cardIds),
    loadThemeRelations(),
  ])
  if (prior.error) throw prior.error
  if (prior.data) {
    if (prior.data.request_id === request_id && prior.data.card_ids.join(',') === cardIds.join(',')) return prior.data.result_payload
    if (prior.data.request_id === request_id) throw new GameError('IDEMPOTENCY_CONFLICT', 409)
    throw new GameError('ROUND_ALREADY_SUBMITTED', 409)
  }

  if (reused.error) throw reused.error
  if (reused.data && (reused.data.battle_id !== battle.id || reused.data.round_number !== roundNumber || reused.data.card_ids.join(',') !== cardIds.join(','))) {
    throw new GameError('IDEMPOTENCY_CONFLICT', 409)
  }
  if (battle.status === 'finished') throw new GameError('BATTLE_FINISHED', 409)
  if (roundNumber !== battle.current_round) throw new GameError('INVALID_ROUND', 409)
  if (!Array.isArray(battle.current_hand) || !cardIds.every((id) => battle.current_hand.includes(id))) throw new GameError('INVALID_CARDS')

  if (cardsResult.error) throw cardsResult.error
  const cardsById = new Map(cardsResult.data.map((card: any) => [card.id, card]))
  const expectedSlots = ['setup', 'development', 'boost', 'punch']
  const cards = cardIds.map((id, i) => cardsById.get(id) as Record<string, unknown> | undefined)
  if (cards.some((card, i) => !card || card.slot !== expectedSlots[i])) throw new GameError('INVALID_CARDS')

  if (owned.error) throw owned.error
  if (owned.data.length !== 4) throw new GameError('CARD_NOT_OWNED', 403)
  if (owned.data.some((row: any) => Number(row.uses_left) <= 0)) throw new GameError('CARD_BURNED', 403)

  // Пары в таблице уже в алфавитном порядке (theme_a < theme_b); scoring сортирует ключ так же.
  const relations: ThemeRelations = {}
  for (const row of relationsQuery) {
    relations[`${row.theme_a}|${row.theme_b}`] = Number(row.strength)
  }

  const theme = battle.themes[roundNumber - 1]
  const scoredRound = await scoreRound(cards as Record<string, unknown>[], theme, Number((Array.isArray(battle.opponents) ? battle.opponents[0] : battle.opponents)?.level || 1), relations)
  const scored = { round: { number: roundNumber, ...scoredRound.round } }
  const result = await db.rpc('submit_round_atomic', {
    p_player_id: player.id,
    p_battle_id: battle.id,
    p_round_number: roundNumber,
    p_request_id: request_id,
    p_card_ids: cardIds,
    p_round_data: scored,
  })
  rpcError(result.error)
  return result.data
}))
