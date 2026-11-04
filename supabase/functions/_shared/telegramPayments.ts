import { GameError } from './common.ts'

export async function telegramPaymentApi(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token || !Deno.env.get('TELEGRAM_PAYMENT_WEBHOOK_SECRET')) throw new GameError('PAYMENT_UNAVAILABLE', 503)
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error('Telegram payment API failed')
    return data.result
  } catch {
    // Never expose Telegram's URL: it contains the bot token.
    throw new GameError('PAYMENT_UNAVAILABLE', 503)
  }
}
