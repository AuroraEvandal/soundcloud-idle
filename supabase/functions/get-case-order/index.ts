import { authPlayer, db, GameError, handle, requestId } from '../_shared/common.ts'
import { caseResult, petRpc } from '../_shared/pets.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const { data, error } = await db.from('case_orders').select('status,response')
    .eq('id', requestId(body.orderId)).eq('player_id', player.id).maybeSingle()
  if (error) throw error
  if (!data) throw new GameError('ORDER_NOT_FOUND', 404)
  return data.status === 'paid'
    ? caseResult(await petRpc('case_result_view', { p_player_id: player.id, p_result: data.response }))
    : { status: 'pending' }
}))
