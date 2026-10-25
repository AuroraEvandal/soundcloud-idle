import { authPlayer, handle } from '../_shared/common.ts'
import { readBattle } from '../_shared/battle.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (typeof body.battleId !== 'string') throw new Error('BATTLE_NOT_FOUND')
  return await readBattle(player.id, body.battleId)
}))
