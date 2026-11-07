import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite, context, home, battle, profile, telegram
const player = { id: 'ui-player', coins: 2450, level: 7, streams: 12800, popularity: 340, xp: 420, xp_to_next: 650, skills: { rhyme: 12, flow: 10, punch: 9, charisma: 8 } }
const ctx = {
  nick: 'Тестовый артист', player,
  profile: { opponents: [{ id: 1, name: 'МС Подвал', level: 1, location: 'Двор', unlocked: true }], stats: { battles_played: 24, wins: 18, losses: 6 } },
  petCollection: { active_pet_id: 'scalevillity', pets: [{ id: 'scalevillity', name: 'Скейлвиллити', owned: true, level: 2, friendship: 28, friendship_stage: 1, income_pct: 3 }] },
  telegramMessages: { adam: [{ text: 'Настоящее сообщение' }], topor: [] },
}
const render = (Component, props = {}) => renderToStaticMarkup(h(context.Provider, { value: ctx }, h(Component, props)))

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  context = (await vite.ssrLoadModule('/src/GameContext.jsx')).GameContext
  home = (await vite.ssrLoadModule('/src/screens/Home.jsx')).default
  battle = (await vite.ssrLoadModule('/src/screens/Battle.jsx')).default
  profile = (await vite.ssrLoadModule('/src/screens/Profile.jsx')).default
  telegram = (await vite.ssrLoadModule('/src/screens/Telegram.jsx')).default
})
after(async () => vite?.close())

test('home shows actual player resources and all seven app launchers', () => {
  const html = render(home)
  assert.match(html, /Тестовый артист/)
  assert.match(html.replaceAll(/\s|&nbsp;/g, ''), /2450/)
  for (const name of ['SoundWave', 'Студия', 'Колода', 'ТГ', 'Профиль', 'Магазин', 'Казик']) assert.ok(html.includes(`aria-label="${name}"`))
})

test('opponent selection uses the original opponent sprite and display name', () => {
  const html = render(battle)
  assert.match(html, /3гот2010/)
  assert.match(html, /\/opponents\/3got2010.png/)
})

test('profile retains original player and pet art, progression and companion actions', () => {
  const html = render(profile)
  assert.match(html, /\/player\/freshman.png/)
  assert.match(html, /\/pets\/scalevillity\/idle.png/)
  assert.match(html, /Скейлвиллити/)
  assert.match(html, /420/)
  assert.match(html, /650/)
  assert.match(html, /28/)
  assert.match(html, /ОТПУСТИТЬ ОТДОХНУТЬ|Отпустить отдохнуть/)
})

test('messenger starts with contacts and existing previews, without a fabricated conversation', () => {
  const html = render(telegram)
  assert.match(html, /Менеджер Адам/)
  assert.match(html, /ТОПОР 18\+/)
  assert.match(html, /Настоящее сообщение/)
  assert.doesNotMatch(html, /<form|class="bubble|Залетаю в студию/)
})
