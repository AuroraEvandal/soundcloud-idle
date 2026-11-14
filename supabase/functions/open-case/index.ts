import { authPlayer, GameError, handle, requestId } from '../_shared/common.ts'
import { caseResult, petRpc } from '../_shared/pets.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (body.caseId !== 'free') throw new GameError('INVALID_REQUEST')
  return caseResult(await petRpc('open_free_case', { p_player_id: player.id, p_request_id: requestId(body.requestId) }))
}))
