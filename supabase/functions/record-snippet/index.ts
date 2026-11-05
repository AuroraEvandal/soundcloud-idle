import { db, GameError, handle, playerView, requestId, rpcError, telegramUser } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async (body) => {
  const user = await telegramUser(body.initData)
  const taps = Number(body.taps)
  if (!Number.isSafeInteger(taps) || taps < 1 || taps > 2147483647) throw new GameError('INVALID_REQUEST')
  const { data, error } = await db.rpc('record_snippet_by_telegram', {
    p_telegram_id: user.id, p_taps: taps,
    p_request_id: body.requestId == null ? crypto.randomUUID() : requestId(body.requestId),
  })
  rpcError(error)
  return { player: playerView(data.player), studio: data.studio, released: data.released }
}))
