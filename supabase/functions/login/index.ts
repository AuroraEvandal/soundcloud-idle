import { db, GameError, handle, playerView, telegramUser } from '../_shared/common.ts'

const START_CARD_IDS = [140, 101, 102, 104, 105, 141, 111, 112, 113, 115, 143, 121, 122, 124, 125, 131, 132, 133, 134]

Deno.serve((req) => handle(req, async (body) => {
  const user = await telegramUser(body.initData)
  let isNew = false
  let { data: player, error } = await db.from('players').insert({
    telegram_id: user.id,
    username: user.username,
    coins: 350,
  }).select('*').single()

  if (error?.code === '23505') {
    const existing = await db.from('players').select('*').eq('telegram_id', user.id).single()
    if (existing.error) throw existing.error
    player = existing.data
    // Ник всегда берётся из Telegram: подтягиваем новый, если игрок сменил его там.
    if (player.username !== user.username) {
      const renamed = await db.from('players').update({ username: user.username }).eq('id', player.id).select('*').single()
      if (renamed.error) throw renamed.error
      player = renamed.data
    }
  } else if (error) {
    throw error
  } else {
    isNew = true
  }

  // Safe on every login: recovers cleanly if a first-time insert was interrupted.
  const grant = await db.from('player_cards').upsert(
    START_CARD_IDS.map((card_id) => ({ player_id: player.id, card_id })),
    { onConflict: 'player_id,card_id', ignoreDuplicates: true },
  )
  if (grant.error) throw grant.error

  const today = new Date().toISOString().slice(0, 10)
  if (player.ai_requests_date !== today) {
    const reset = await db.from('players').update({ ai_requests_today: 0, ai_requests_date: today }).eq('id', player.id).select('*').single()
    if (reset.error) throw reset.error
    player = reset.data
  }
  return { is_new: isNew, player: playerView(player) }
}))
