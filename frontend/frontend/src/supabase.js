import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Общий таймаут ограничивает зависшие сетевые вызовы и при этом сохраняет
// отмену запроса, если её передал сам вызывающий код.
const timeoutFetch = (input, init = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 15_000)
  const externalSignal = init.signal || (input instanceof Request ? input.signal : undefined)
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  })
}

// Если ключей нет, клиент не создаётся; production-код не должен молча включать мок.
export const supabase = url && key ? createClient(url, key, { global: { fetch: timeoutFetch } }) : null
