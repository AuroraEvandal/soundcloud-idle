import { authPlayer, GameError, handle } from '../_shared/common.ts'
import { petRpc } from '../_shared/pets.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (body.petId !== null && typeof body.petId !== 'string') throw new GameError('INVALID_REQUEST')
  return await petRpc('equip_pet_atomic', { p_player_id: player.id, p_pet_id: body.petId })
}))
