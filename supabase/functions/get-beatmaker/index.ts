import { authPlayer, db, handle, playerView } from '../_shared/common.ts'
import { refreshEnergy } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const fresh = await refreshEnergy(player)
  const { data, error } = await db.from('player_recorded_beats').select(
    'id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown,status,sale_coins,stream_cap,streams_paid,released_at,created_at',
  ).eq('player_id', player.id).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  const now = Date.now()
  const beats = (data || []).map((beat: any) => {
    if (!beat.stream_cap || !beat.released_at || !['streaming', 'complete'].includes(beat.status)) {
      return { ...beat, collectable_streams: 0, collectable_coins: 0 }
    }
    const elapsed = Math.max(0, (now - Date.parse(beat.released_at)) / 1000)
    const available = Math.min(Number(beat.stream_cap), Math.floor(Number(beat.stream_cap) * Math.min(1, elapsed / 86400)))
    const collectable = Math.max(0, available - Number(beat.streams_paid))
    const coins = Math.floor((Number(beat.streams_paid) + collectable) / 10) - Math.floor(Number(beat.streams_paid) / 10)
    return { ...beat, collectable_streams: collectable, collectable_coins: coins }
  })
  return { player: playerView(fresh), energy: fresh.energy, energy_cost: 20, beats }
}))
