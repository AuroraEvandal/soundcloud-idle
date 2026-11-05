import { db, handle, playerView, rpcError, telegramUser } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const user = await telegramUser(body.initData)
  const { data, error } = await db.rpc('get_studio_by_telegram', { p_telegram_id: user.id })
  rpcError(error)
  return { player: playerView(data.player), studio: data.studio }
}))
