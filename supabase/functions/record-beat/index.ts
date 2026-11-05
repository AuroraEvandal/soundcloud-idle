import { authPlayer, db, handle, GameError, playerView, requestId, rpcError } from '../_shared/common.ts'
import { scoreBeat } from '../_shared/beatmaker.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const scored = scoreBeat(body)
  const { data, error } = await db.rpc('record_beat_atomic', {
    p_player_id: player.id,
    p_request_id: requestId(body.requestId),
    p_genre: scored.genre,
    p_bpm: scored.bpm,
    p_key: scored.key,
    p_scale: scored.scale,
    p_pattern: scored.pattern,
    p_quality_score: scored.quality_score,
    p_score_breakdown: scored.score_breakdown,
  })
  rpcError(error)
  if (!data) throw new GameError('INTERNAL', 500)
  return { player: playerView(data.player), beat: data.beat, energy_cost: data.energy_cost }
}))
