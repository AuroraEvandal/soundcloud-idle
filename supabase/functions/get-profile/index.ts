import { authPlayer, db, handle, playerView } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const [opponents, battles, total, wins, losses] = await Promise.all([
    db.from('opponents').select('id,name,style,level,location_id,locations(name,required_popularity)').order('id'),
    db.from('battles').select('id,opponent_id,result,created_at,opponents(name)').eq('player_id', player.id).eq('status', 'finished').order('created_at', { ascending: false }).limit(5),
    db.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'finished'),
    db.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'finished').eq('result', 'win'),
    db.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'finished').eq('result', 'lose'),
  ])
  if (opponents.error) throw opponents.error
  if (battles.error) throw battles.error
  for (const result of [total, wins, losses]) if (result.error) throw result.error
  const stats = { battles_played: total.count || 0, wins: wins.count || 0, losses: losses.count || 0 }

  const responseOpponents = opponents.data.map((o: any) => {
    const location = Array.isArray(o.locations) ? o.locations[0] : o.locations
    const required = location?.required_popularity || 0
    const unlocked = Number(player.popularity) >= required
    return {
      id: o.id, name: o.name, level: o.level, location: location?.name || '', unlocked,
      ...(!unlocked ? { required_popularity: required } : {}),
    }
  })
  return {
    player: playerView(player),
    stats,
    recent_battles: battles.data.map((b: any) => ({
      id: b.id,
      opponent_id: b.opponent_id,
      opponent_name: Array.isArray(b.opponents) ? b.opponents[0]?.name : b.opponents?.name,
      result: b.result === 'win' ? 'win' : 'loss',
      created_at: b.created_at,
    })),
    opponents: responseOpponents,
  }
}))
