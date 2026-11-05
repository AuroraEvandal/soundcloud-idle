import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('production never substitutes mock progress when Supabase is missing', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, entries: [] },
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.VITE_SUPABASE_URL': '""',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
    },
  })
  try {
    const api = await vite.ssrLoadModule('/src/api.js')
    // Even an accidentally enabled dev flag must not create a fake player or reward.
    for (const name of Object.keys(api.MOCK)) api.MOCK[name] = true
    for (const request of [
      api.login, api.getProfile, api.getStudio, api.getShop, api.getWardrobe, api.getDeck,
      () => api.getHand('battle'), () => api.startBattle(1),
      () => api.submitRound('battle', 1, [1, 2, 3, 4]),
      () => api.startMiniGame('battle', 2), () => api.finishMiniGame('battle', 'mini', 'tap-1'),
      () => api.recordSnippet(1), () => api.selectBeat(1), () => api.buyBeat(1),
      () => api.buyItem('equipment', 1), () => api.equipItem('hat', 1), () => api.openPack(1),
    ]) {
      await assert.rejects(request, (error) => error.code === 'CONFIGURATION_ERROR' && !error.network)
    }
  } finally { await vite.close() }
})
