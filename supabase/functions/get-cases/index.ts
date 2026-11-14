import { authPlayer, handle } from '../_shared/common.ts'
import { petRpc } from '../_shared/pets.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  return await petRpc('cases_view', { p_player_id: player.id })
}))
