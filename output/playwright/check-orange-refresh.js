// UI fixtures only: no live player state, purchases or payments are changed.
async page => {
  const errors = []
  const onError = error => errors.push(error.message)
  page.on('pageerror', onError)
  const catalog = await page.evaluate(async () => {
    const { CLOTHING, BEATS, EQUIPMENT } = await import('/src/mockCatalog.js')
    return { CLOTHING, BEATS, EQUIPMENT }
  })
  const player = { id: '00000000-0000-4000-8000-000000000071', username: 'adam', level: 7, coins: 2450, streams: 12800, popularity: 340, xp: 420, xp_to_next: 650, skills: { rhyme: 12, flow: 10, punch: 9, charisma: 8 } }
  const opponents = [
    { id: 1, name: '3гот2010', location: 'Двор', level: 1, unlocked: true, required_popularity: 0 },
    { id: 2, name: 'арлекин40тыщ', location: 'Район', level: 2, unlocked: true, required_popularity: 30 },
    { id: 3, name: 'пузо80', location: 'Подземка', level: 3, unlocked: true, required_popularity: 100 },
    { id: 4, name: 'XVIIroyal', location: 'Клуб', level: 4, unlocked: true, required_popularity: 200 },
    { id: 5, name: 'DOOM RUSHA', location: 'Фестиваль', level: 5, unlocked: false, required_popularity: 400 },
  ]
  const pets = { active_pet_id: 'micity', income_pct: 1, pets: ['soundity', 'micity', 'scalevillity'].map((id, i) => ({ id, name: ['Саундити', 'Майкити', 'Скейлвиллити'][i], level: 1, owned: i < 2, friendship: 12, friendship_stage: 1, income_pct: 1 })) }
  const clothing = catalog.CLOTHING.map(c => ({ ...c, owned: [1, 2, 5, 7].includes(c.id) }))
  const wardrobe = { player, items: clothing.filter(c => c.owned), outfit: { hat: 1, hoodie: 2, pants: 5, shoe: 7, chain: null }, bonuses: { income_pct: 6, popularity_pct: 14, charisma: 0 } }
  const studio = { hype: 14, hype_max: 20, energy: 68, energy_max: 100, income_pct: 20, selected_beat_id: 1, beats: catalog.BEATS.map(b => ({ ...b, owned: b.id === 1 })), equipment: catalog.EQUIPMENT.map(e => ({ ...e, owned: e.id === 1 })) }
  const slots = ['setup', 'development', 'boost', 'punch']
  const cards = slots.flatMap((slot, i) => Array.from({ length: 4 }, (_, j) => ({ id: 100 + i * 4 + j, slot, text: ['Я выхожу на бит, и район затих', 'Мои строки остаются в этих переулках', 'Ты слышишь каждый слог сквозь шум улиц', 'Этот город запомнит наш голос'][j], theme: 'улица', rarity: ['common', 'rare', 'epic', 'common'][j], uses_left: j === 3 ? 0 : 3 - j })))
  const hand = Object.fromEntries(slots.map(slot => [slot, cards.filter(c => c.slot === slot)]))
  const battle = { id: '00000000-0000-4000-8000-000000000072', opponent: opponents[0], player_rounds_won: 0, opponent_rounds_won: 0, status: 'active' }
  const cases = [{ id: 'free', name: 'Ежедневный кейс', price_stars: 0, pet_chance: .0005, fallback_coins: 25, available_at: null }, { id: 'underground', name: 'Андеграунд', price_stars: 29, pet_chance: .01, fallback_coins: 150, available_at: null }, { id: 'gift-vault', name: 'Хранилище подарков', price_stars: 100, pet_chance: .03, fallback_coins: 600, available_at: null }]
  const pattern = /\/functions\/v1\/(login|get-profile|get-pets|get-studio|get-deck|get-shop|get-wardrobe|get-cases|get-beatmaker|start-battle|get-hand|record-snippet|equip-pet|buy-item|equip-item|open-case|open-pack)(\?|$)/
  const handler = async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = {
      login: { player, is_new: false },
      'get-profile': { player, opponents, stats: { battles_played: 24, wins: 18, losses: 6 }, recent_battles: [{ id: 'fixture-history', opponent_id: 1, opponent_name: '3гот2010', result: 'win' }] },
      'get-pets': pets, 'get-studio': { player, studio }, 'get-deck': { cards },
      'get-shop': { player, clothing, packs: [{ id: 1, name: 'Базовый пак', price: 200 }] },
      'get-wardrobe': wardrobe, 'get-cases': { cases, pets },
      'get-beatmaker': { player, beats: [], energy: 68, record_energy_cost: 50, next_cursor: null },
      'start-battle': { battle, round: { number: 1, theme: 'улица' }, hand },
      'get-hand': { battle, round: { number: 1, theme: 'улица' }, cards: hand },
      'record-snippet': { player, studio, released: [] },
      'open-pack': { player, drop: { type: 'card', card: cards[0], duplicate: true, refund: 100 } },
    }[name]
    if (!data) throw Error('Unexpected mutation in visual smoke: ' + name)
    return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } })
  }
  await page.route(pattern, handler)
  await page.addInitScript(() => { window.Telegram = { WebApp: { initData: 'ui-fixture-only', ready() {}, expand() {} } }; localStorage.removeItem('sw_battle_id') })
  const screenshots = []
  const check = async name => {
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode().catch(() => {}))))
    const issues = await page.evaluate(() => {
      const main = document.querySelector('.phone')
      const bad = [...document.querySelectorAll('.home, .app-body, .appbar, .dock, .panel, .row, .deck-grid, .card, .opp, .chat-item, .case-preview, .tabs')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className)
      const broken = [...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute('src'))
      const back = document.querySelector('.appbar-btn')
      const nav = back && { top: back.getBoundingClientRect().top, bar: document.querySelector('.statusbar').getBoundingClientRect().bottom, shell: main.scrollTop, viewport: document.querySelector('.viewport').scrollTop }
      return { bad, broken, outer: main.scrollWidth > main.clientWidth + 2, nav }
    })
    if (issues.outer || issues.bad.length || issues.broken.length || (issues.nav && issues.nav.top < issues.nav.bar - 1)) throw Error(name + ': ' + JSON.stringify(issues))
    const path = `output/playwright/orange-${name}.png`
    await page.screenshot({ path, animations: 'disabled' })
    screenshots.push(path)
  }
  const open = async name => { await page.getByRole('button', { name, exact: true }).first().click() }
  const back = async () => { await page.getByRole('button', { name: 'Назад', exact: true }).click() }
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByRole('heading', { name: 'Привет, adam' }).waitFor()
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
      await check('home-' + width)
      for (const [app, id] of [['SoundWave', 'soundwave'], ['Студия', 'studio'], ['Колода', 'deck'], ['ТГ', 'chats'], ['Профиль', 'profile'], ['Магазин', 'store'], ['Казик', 'cases']]) {
        await open(app)
        await page.locator('.appbar').waitFor()
        if (id === 'soundwave') await page.locator('.opp-portrait img').first().waitFor()
        if (id === 'studio') await page.getByRole('button', { name: 'Микрофон: тапай, чтобы набрать хайп' }).waitFor()
        if (id === 'deck') await page.locator('.deck-grid').first().waitFor()
        if (id === 'store') await page.locator('.mannequin').waitFor()
        if (id === 'cases') await page.locator('.case-preview').waitFor()
        await check(id + '-' + width)
        if (id === 'chats') {
          if (await page.locator('.bubble, .inputbar').count()) throw Error('Conversation leaked into chat list')
          await page.getByRole('button', { name: /Менеджер Адам/ }).click()
          await page.locator('.bubble').first().waitFor()
          if (await page.locator('.bubble.me').count()) throw Error('Fabricated outgoing reply')
          await check('conversation-' + width)
          await back()
        }
        if (id === 'profile') {
          await page.getByRole('button', { name: /Как всё начиналось/ }).click()
          await page.getByRole('region', { name: 'История фрешмена' }).waitFor()
          await check('intro-' + width)
          await page.getByRole('button', { name: /Закрыть/ }).click()
        }
        if (id === 'deck') {
          if (await page.getByRole('button', { name: /ОТКРЫТЬ ПАК/ }).count()) throw Error('Pack button in collection')
          await page.getByRole('tab', { name: 'Паки', exact: true }).click()
          await page.getByRole('button', { name: /ОТКРЫТЬ ПАК/ }).waitFor()
          await check('packs-' + width)
          await page.getByRole('button', { name: /ОТКРЫТЬ ПАК/ }).click()
          await page.getByText(/Такая карточка уже была/).waitFor()
          const packButton = page.getByRole('button', { name: /ОТКРЫТЬ ПАК/ })
          await packButton.scrollIntoViewIfNeeded()
          const packBounds = await packButton.boundingBox()
          const bodyBounds = await page.locator('.app-body').boundingBox()
          if (packBounds.y + packBounds.height > bodyBounds.y + bodyBounds.height + 1) throw Error('Pack result clips the next opening button at ' + width)
          await check('pack-result-' + width)
        }
        if (id === 'store') {
          await page.getByRole('tab', { name: 'Магазин', exact: true }).click()
          await page.locator('.catalog-grid .thumb').first().waitFor()
          await check('catalog-' + width)
        }
        if (id === 'studio') {
          for (const tab of ['Биты', 'Техника', 'Beat Lab']) {
            await page.getByRole('tab', { name: tab, exact: true }).click()
            await check('studio-' + tab.replace(' ', '-') + '-' + width)
          }
        }
        await back()
      }
    }
    await page.setViewportSize({ width: 320, height: 568 })
    await open('SoundWave')
    await page.locator('.opp').first().click()
    await page.locator('.hand .card').first().waitFor()
    await check('battle-320')
    for (const slot of ['Завязка', 'Развитие', 'Усиление', 'Панч']) {
      await page.locator('.slot').filter({ hasText: slot }).click()
      await page.locator('.hand .card').first().click()
    }
    if (await page.getByRole('button', { name: 'ЗАЧИТАТЬ', exact: true }).isDisabled()) throw Error('Battle selection controls no longer work')
    await check('battle-selected-320')
    if (errors.length) throw Error(errors.join('\n'))
    return { result: 'PASS: all apps, inner tabs, real image paths, conversation navigation, card selection; 320x568 and 390x844 without overflow', screenshots }
  } finally {
    await page.unroute(pattern, handler)
    page.off('pageerror', onError)
  }
}
