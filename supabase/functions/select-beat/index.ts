import { authPlayer, db, GameError, handle, playerView } from '../_shared/common.ts'
import { refreshEnergy, studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const beatId = Number(body.beatId)
  if (!Number.isSafeInteger(beatId) || beatId <= 0) throw new GameError('ITEM_NOT_FOUND')
  const beat = await db.from('beats').select('id').eq('id', beatId).maybeSingle()
  if (beat.error) throw beat.error
  if (!beat.data) throw new GameError('ITEM_NOT_FOUND')
  const owned = await db.from('player_beats').select('beat_id').eq('player_id', player.id).eq('beat_id', beatId).maybeSingle()
  if (owned.error) throw owned.error
  if (!owned.data) throw new GameError('NOT_OWNED')
  const upd = await db.from('players').update({ selected_beat_id: beatId }).eq('id', player.id).select('*').single()
  if (upd.error) throw upd.error
  const fresh = await refreshEnergy(upd.data)
  return { player: playerView(fresh), studio: await studioView(fresh) }
}))
