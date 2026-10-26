import { authPlayer, handle, playerView } from '../_shared/common.ts'
import { refreshEnergy, studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const fresh = await refreshEnergy(player)
  return { player: playerView(fresh), studio: await studioView(fresh) }
}))
