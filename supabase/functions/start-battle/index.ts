import { authPlayer, db, handle, requestId, rpcError } from '../_shared/common.ts'
import { randomOpponentOutfit, readBattle } from '../_shared/battle.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const opponentId = Number(body.opponentId)
  if (!Number.isSafeInteger(opponentId) || opponentId <= 0) throw new Error('OPPONENT_NOT_FOUND')
  const request_id = requestId(body.requestId)
  const created = await db.rpc('create_battle_atomic', {
    p_player_id: player.id,
    p_opponent_id: opponentId,
    p_request_id: request_id,
  })
  rpcError(created.error)

  // Одежда соперника выбирается один раз на батл и хранится в самом батле,
  // чтобы восстановление через get-hand показывало тот же образ.
  const outfit = await randomOpponentOutfit()
  const saved = await db.from('battles').update({ opponent_outfit: outfit }).eq('id', created.data)
  if (saved.error) throw saved.error

  const state = await readBattle(player.id, created.data)
  return {
    battle: state.battle,
    round: state.round,
    hand: state.cards,
    last_result: state.last_result,
  }
}))
