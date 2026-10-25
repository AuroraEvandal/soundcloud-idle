import { authPlayer, db, handle, playerView } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  const [opponents, battles] = await Promise.all([
    db.from('opponents').select('id,name,style,level,location_id,locations(name,required_popularity)').order('id'),
    db.from('battles').select('id,result,created_at,opponents(name)').eq('player_id', player.id).eq('status', 'finished').order('created_at', { ascending: false }).limit(5),
  ])
  if (opponents.error) throw opponents.error
  if (battles.error) throw battles.error

  const all = await db.from('battles').select('result').eq('player_id', player.id).eq('status', 'finished')
  if (all.error) throw all.error
  const stats = { battles_played: all.data.length, wins: 0, losses: 0 }
  for (const battle of all.data) {
    if (battle.result === 'win') stats.wins++
    if (battle.result === 'lose') stats.losses++
  }

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
      opponent_name: Array.isArray(b.opponents) ? b.opponents[0]?.name : b.opponents?.name,
      result: b.result === 'win' ? 'win' : 'loss',
      created_at: b.created_at,
    })),
    opponents: responseOpponents,
  }
}))
