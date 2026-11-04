import { db } from '../_shared/common.ts'
import { equalSecret, paymentOrderId, validCheckout } from '../_shared/paymentValidation.ts'
import { telegramPaymentApi } from '../_shared/telegramPayments.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (!equalSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), Deno.env.get('TELEGRAM_PAYMENT_WEBHOOK_SECRET'))) {
    return new Response(null, { status: 401 })
  }
  try {
    const update = await req.json()
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query
      const orderId = paymentOrderId(query.invoice_payload)
      if (typeof query.id !== 'string') return new Response(null, { status: 400 })
      let order = null
      if (orderId) {
        const result = await db.from('case_orders').select('status,telegram_id,price_stars').eq('id', orderId).maybeSingle()
        if (result.error) throw result.error
        order = result.data
      }
      const ok = validCheckout(order, query)
      await telegramPaymentApi('answerPreCheckoutQuery', {
        pre_checkout_query_id: query.id, ok,
        ...(!ok ? { error_message: 'Заказ недоступен. Откройте новый счёт в игре.' } : {}),
      })
    }
    const message = update.message
    const payment = message?.successful_payment
    if (payment) {
      const orderId = paymentOrderId(payment.invoice_payload)
      if (!orderId || !Number.isSafeInteger(message.from?.id) || !Number.isSafeInteger(payment.total_amount)
        || payment.currency !== 'XTR' || typeof payment.telegram_payment_charge_id !== 'string') {
        return new Response(null, { status: 400 })
      }
      const { error } = await db.rpc('fulfill_case_order', {
        p_order_id: orderId, p_telegram_id: message.from.id, p_currency: payment.currency,
        p_amount: payment.total_amount, p_charge_id: payment.telegram_payment_charge_id,
      })
      if (error) throw error
    }
    return Response.json({ ok: true })
  } catch {
    // Telegram retries failed delivery; never acknowledge a failed transaction or log payment secrets.
    return Response.json({ ok: false }, { status: 500 })
  }
})
