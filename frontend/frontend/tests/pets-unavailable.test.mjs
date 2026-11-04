import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('pets and cases never fall back to mock ownership, money, or invoices without Supabase', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' },
  })
  try {
    const api = await vite.ssrLoadModule('/src/api.js')
    for (const request of [api.getPets, () => api.equipPet('soundity'), api.getCases, () => api.openCase('free'), () => api.createCaseInvoice('underground'), () => api.getCaseOrder('order')]) {
      await assert.rejects(request, (error) => error.code === 'PAYMENT_UNAVAILABLE' && !error.network)
    }
  } finally { await vite.close() }
})
