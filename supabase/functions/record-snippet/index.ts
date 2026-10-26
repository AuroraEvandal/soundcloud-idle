import { authPlayer, db, GameError, handle, playerView } from '../_shared/common.ts'
import { bonusPct, HYPE_MAX, MAX_TAPS_PER_REQUEST, refreshEnergy, releaseRewards, studioView } from '../_shared/studio.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  let taps = Number(body.taps)
  if (!Number.isSafeInteger(taps) || taps < 1) throw new GameError('INVALID_REQUEST')
  taps = Math.min(taps, MAX_TAPS_PER_REQUEST)

  const fresh = await refreshEnergy(player)
  const energy = Number(fresh.energy)
  if (energy <= 0) throw new GameError('NO_ENERGY')
  const use = Math.min(taps, energy)

  // Бит для релизов. Если у игрока почему-то ничего не выбран — выбираем бесплатный.
  let beat: Record<string, any> | null = null
  if (fresh.selected_beat_id) {
    const row = await db.from('beats').select('id,base_streams').eq('id', fresh.selected_beat_id).maybeSingle()
    if (row.error) throw row.error
    beat = row.data
  }
  if (!beat) {
    const free = await db.from('beats').select('id,base_streams').eq('price', 0).order('id').limit(1).maybeSingle()
    if (free.error) throw free.error
    if (!free.data) throw new GameError('ITEM_NOT_FOUND')
    beat = free.data
    await db.from('players').update({ selected_beat_id: beat.id }).eq('id', fresh.id)
  }

  // Тапы списывают энергию и копят хайп; каждые hype_max хайпа — релиз.
  // Релизы одного запроса считаем подряд: популярность растёт от релиза к релизу.
  const bonuses = await bonusPct(fresh.id)
  const total = Number(fresh.hype || 0) + use
  const releaseCount = Math.floor(total / HYPE_MAX)
  const newHype = total % HYPE_MAX

  let popularity = Number(fresh.popularity)
  let coins = 0
  let streamsTotal = 0
  const released = []
  for (let i = 0; i < releaseCount; i++) {
    const r = releaseRewards(Number(beat.base_streams), popularity, bonuses.income_pct, bonuses.popularity_pct)
    popularity += r.popularity_change
    coins += r.coins
    streamsTotal += r.streams
    released.push(r)
  }

  const upd = await db.from('players').update({
    energy: energy - use,
    hype: newHype,
    ...(releaseCount > 0 ? {
      popularity,
      coins: Number(fresh.coins) + coins,
      streams: Number(fresh.streams || 0) + streamsTotal,
    } : {}),
  }).eq('id', fresh.id).select('*').single()
  if (upd.error) throw upd.error

  return { player: playerView(upd.data), studio: await studioView(upd.data), released }
}))
