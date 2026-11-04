import { authPlayer, db, GameError, handle, requestId } from '../_shared/common.ts'
import { petRpc } from '../_shared/pets.ts'
import { telegramPaymentApi } from '../_shared/telegramPayments.ts'

Deno.serve((req) => handle(req, async (body) => {
  const { player } = await authPlayer(body)
  if (!Deno.env.get('TELEGRAM_BOT_TOKEN') || !Deno.env.get('TELEGRAM_PAYMENT_WEBHOOK_SECRET')) throw new GameError('PAYMENT_UNAVAILABLE', 503)
  if (body.caseId !== 'underground' && body.caseId !== 'gift-vault') throw new GameError('INVALID_REQUEST')
  const order = await petRpc('create_case_order', { p_player_id: player.id, p_case_id: body.caseId, p_request_id: requestId(body.requestId) })
  if (order.invoice_url) return { invoice_url: order.invoice_url, order_id: order.id }
  const invoice = await telegramPaymentApi('createInvoiceLink', {
    title: body.caseId === 'underground' ? 'Андеграунд' : 'Хранилище подарков',
    description: `Кейс: шанс питомца ${body.caseId === 'underground' ? '1' : '3'}%, иначе ${body.caseId === 'underground' ? 150 : 600} монет.`,
    payload: `case:${order.id}`, currency: 'XTR', provider_token: '',
    prices: [{ label: 'Кейс', amount: order.price_stars }],
  })
  if (typeof invoice !== 'string' || !invoice.startsWith('https://t.me/')) throw new GameError('PAYMENT_UNAVAILABLE', 503)
  const { error } = await db.from('case_orders').update({ invoice_url: invoice }).eq('id', order.id).is('invoice_url', null)
  if (error) throw error
  const saved = await db.from('case_orders').select('invoice_url').eq('id', order.id).single()
  if (saved.error) throw saved.error
  return { invoice_url: saved.data.invoice_url, order_id: order.id }
}))
