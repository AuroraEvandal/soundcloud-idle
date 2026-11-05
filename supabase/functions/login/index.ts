import { db, GameError, handle, playerView, telegramUser } from '../_shared/common.ts'

const START_CARD_IDS = [140, 101, 102, 104, 105, 141, 111, 112, 113, 115, 143, 121, 122, 124, 125, 131, 132, 133, 134]

Deno.serve((req) => handle(req, async (body) => {
  const user = await telegramUser(body.initData)
  let isNew = false
  let { data: player, error } = await db.from('players').insert({
    telegram_id: user.id,
    username: user.username,
    // Монеты не указываем: применится дефолт базы (300).
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

  // Бесплатные биты (цена 0) выдаются так же идемпотентно, как стартовые карточки.
  const freeBeats = await db.from('beats').select('id').eq('price', 0)
  if (freeBeats.error) throw freeBeats.error
  if (freeBeats.data.length) {
    const beatGrant = await db.from('player_beats').upsert(
      freeBeats.data.map((beat: any) => ({ player_id: player.id, beat_id: beat.id })),
      { onConflict: 'player_id,beat_id', ignoreDuplicates: true },
    )
    if (beatGrant.error) throw beatGrant.error
    if (player.selected_beat_id === null) {
      const picked = await db.from('players')
        .update({ selected_beat_id: freeBeats.data[0].id })
        .eq('id', player.id).select('*').single()
      if (picked.error) throw picked.error
      player = picked.data
    }
  }

  return { is_new: isNew, player: playerView(player) }
}))
