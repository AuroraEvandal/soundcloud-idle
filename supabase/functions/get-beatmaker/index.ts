import { authPlayer, db, handle, playerView, GameError, requestId } from '../_shared/common.ts'
import { refreshEnergy } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const fresh = await refreshEnergy(player)
  let query = db.from('player_recorded_beats').select(
    'id,genre,bpm,musical_key,scale,pattern,quality_score,score_breakdown,status,sale_coins,stream_cap,streams_paid,released_at,created_at',
  ).eq('player_id', player.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(101)
  if (body.before != null) {
    const cursor = body.before as { created_at?: unknown; id?: unknown }
    if (!cursor || typeof cursor.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at) || !Number.isFinite(Date.parse(cursor.created_at))) throw new GameError('INVALID_REQUEST')
    let id: string
    try { id = requestId(cursor.id) } catch { throw new GameError('INVALID_REQUEST') }
    query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${id})`)
  }
  const { data, error } = await query
  if (error) throw error
  const now = Date.now()
  const page = (data || []).slice(0, 100)
  const last = page[page.length - 1]
  const beats = page.map((beat: any) => {
    const instant_sale_coins = 10 + Math.round(beat.quality_score * 0.2) + Math.floor(Math.min(fresh.popularity, 400) / 40)
    if (!beat.stream_cap || !beat.released_at || !['streaming', 'complete'].includes(beat.status)) {
      return { ...beat, instant_sale_coins, collectable_streams: 0, collectable_coins: 0 }
    }
    const elapsed = Math.max(0, (now - Date.parse(beat.released_at)) / 1000)
    const available = Math.min(Number(beat.stream_cap), Math.floor(Number(beat.stream_cap) * Math.min(1, elapsed / 86400)))
    const collectable = Math.max(0, available - Number(beat.streams_paid))
    const coins = Math.floor((Number(beat.streams_paid) + collectable) / 10) - Math.floor(Number(beat.streams_paid) / 10)
    return { ...beat, instant_sale_coins, collectable_streams: collectable, collectable_coins: coins }
  })
  return { player: playerView(fresh), energy: fresh.energy, energy_cost: 50, beats,
    next_cursor: data && data.length > 100 ? { created_at: last.created_at, id: last.id } : null }
}))
