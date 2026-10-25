import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class GameError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}

export const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(keyBytes: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message).buffer as ArrayBuffer)
}

export async function telegramUser(initData: unknown) {
  if (typeof initData !== 'string' || !initData) throw new GameError('INVALID_INIT_DATA', 401)
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!hash || !Number.isInteger(authDate) || !botToken) throw new GameError('INVALID_INIT_DATA', 401)
  const now = Math.floor(Date.now() / 1000)
  if (authDate > now + 60 || now - authDate > 24 * 60 * 60) throw new GameError('INVALID_INIT_DATA', 401)

  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = await hmac(new TextEncoder().encode('WebAppData').buffer as ArrayBuffer, botToken)
  const expected = hex(await hmac(secret, checkString))
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(hash.toLowerCase())
  // Compare all bytes without returning early on the first mismatch.
  let mismatch = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  if (mismatch) throw new GameError('INVALID_INIT_DATA', 401)

  let user: { id?: number; username?: string; first_name?: string }
  try { user = JSON.parse(params.get('user') || '{}') } catch { throw new GameError('INVALID_INIT_DATA', 401) }
  if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) throw new GameError('INVALID_INIT_DATA', 401)
  return { id: String(user.id), username: user.username || user.first_name || 'player' }
}

export async function playerForTelegram(telegramId: string) {
  let { data, error } = await db.from('players').select('*').eq('telegram_id', telegramId).maybeSingle()
  if (error) throw error
  if (!data) throw new GameError('PLAYER_NOT_FOUND', 404)
  const today = new Date().toISOString().slice(0, 10)
  if (data.ai_requests_date !== today) {
    const reset = await db.from('players').update({ ai_requests_today: 0, ai_requests_date: today }).eq('id', data.id).select('*').single()
    if (reset.error) throw reset.error
    data = reset.data
  }
  return data
}

export function playerView(p: Record<string, unknown>) {
  const level = Number(p.level || 1)
  return {
    id: p.id,
    username: p.username,
    avatar: p.avatar || 'default',
    level,
    xp: p.xp,
    xp_to_next: Math.round(100 * Math.pow(1.1, level - 1)),
    popularity: p.popularity,
    coins: p.coins,
    skills: { rhyme: p.skill_rhyme, flow: p.skill_flow, punch: p.skill_punch, charisma: p.skill_charisma },
  }
}

export function requestId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new GameError('INVALID_REQUEST_ID')
  }
  return value
}

export async function handle(req: Request, action: (body: Record<string, unknown>) => Promise<unknown>) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: cors })
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GameError('INVALID_REQUEST')
    const data = await action(body)
    return Response.json(data, { headers: cors })
  } catch (error) {
    const code = error instanceof GameError ? error.code : (error as Error)?.message || 'INTERNAL'
    const known = new Set([
      'INVALID_INIT_DATA', 'PLAYER_NOT_FOUND', 'BATTLE_NOT_FOUND', 'BATTLE_FINISHED',
      'ROUND_ALREADY_SUBMITTED', 'INVALID_ROUND', 'INVALID_CARDS', 'CARD_NOT_OWNED',
      'OPPONENT_LOCKED', 'DAILY_LIMIT', 'IDEMPOTENCY_CONFLICT', 'CARD_POOL_TOO_SMALL',
      'JUDGE_UNAVAILABLE', 'INVALID_REQUEST_ID', 'INVALID_REQUEST', 'OPPONENT_NOT_FOUND',
      'THEMES_NOT_CONFIGURED', 'INVALID_ROUND_RESULT', 'BATTLE_IN_PROGRESS',
    ])
    const safeCode = known.has(code) ? code : 'INTERNAL'
    const status = error instanceof GameError ? error.status : safeCode === 'INTERNAL' ? 500 : 400
    return Response.json({ error: { code: safeCode } }, { status, headers: cors })
  }
}

export const authPlayer = async (body: Record<string, unknown>) => {
  const user = await telegramUser(body.initData)
  const player = await playerForTelegram(user.id)
  return { user, player }
}

export function rpcError(error: { message?: string; code?: string } | null) {
  if (!error) return
  if (error.code === '23505') throw new GameError('IDEMPOTENCY_CONFLICT', 409)
  const code = error.message?.match(/(?:^|\s)([A-Z][A-Z_]+)(?:\s|$)/)?.[1]
  if (code) throw new GameError(code)
  throw error
}

export function mapCard(c: Record<string, unknown>) {
  return {
    id: c.id,
    text: c.text,
    theme: c.theme,
    rarity: c.rarity,
    syllables: c.syllables,
    ...(c.bonus_type ? { bonus: { type: c.bonus_type, value: c.bonus_value } } : {}),
  }
}
