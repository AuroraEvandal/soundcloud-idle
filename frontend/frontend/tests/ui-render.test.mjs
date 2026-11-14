import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite, context, home, battle, profile, telegram, arena, opponentArt
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
  arena = (await vite.ssrLoadModule('/src/components/Arena.jsx')).default
  opponentArt = (await vite.ssrLoadModule('/src/opponentArt.js')).opponentArt
  profile = (await vite.ssrLoadModule('/src/screens/Profile.jsx')).default
  telegram = (await vite.ssrLoadModule('/src/screens/Telegram.jsx')).default
})
after(async () => vite?.close())

test('home shows actual player resources and all eight app launchers', () => {
  const html = render(home)
  assert.match(html, /Тестовый артист/)
  assert.match(html.replaceAll(/\s|&nbsp;/g, ''), /2450/)
  for (const name of ['SoundWave', 'Студия', 'Колода', 'ТГ', 'Профиль', 'Магазин', 'Казик', 'Концерт']) assert.ok(html.includes(`aria-label="${name}"`))
})

test('opponent selection uses the supplied photograph and display name', () => {
  const html = render(battle)
  assert.match(html, /3гот2010/)
  assert.match(html, /\/opponents\/3got2010-cutout\.webp/)
  assert.match(html, /Начать батл/)
})

test('the arena uses the original player, equipped clothing and opponent sprites', () => {
  const html = render(arena, { playerName: ctx.nick, opponentName: '3гот2010', opponentImage: opponentArt(1), playerLook: { hat: '/clothes/cap1.png' } })
  assert.match(html, /\/player\/freshman\.png/)
  assert.match(html, /\/clothes\/cap1\.png/)
  assert.match(html, /\/opponents\/3got2010\.png/)
})

test('the final opponent image and name appear only after the server unlocks it', () => {
  const saved = ctx.profile
  const boss = { id: 5, name: 'DOOM RUSHA', location: 'Фестиваль', unlocked: false }
  ctx.profile = { ...saved, opponents: [...saved.opponents, boss] }
  try {
    assert.doesNotMatch(render(battle), /final-emblem|DOOM RUSHA/)
    boss.unlocked = true
    assert.match(render(battle), /\/opponents\/final-emblem\.jpg/)
    assert.match(render(battle), /DOOM RUSHA/)
  } finally { ctx.profile = saved }
})

test('a server-locked opponent shows both requirements even with enough fans', () => {
  const saved = ctx.profile
  ctx.profile = { ...saved, opponents: [...saved.opponents,
    { id: 2, name: 'Лёха Бит', level: 2, location: 'Двор', unlocked: false, required_popularity: 30 }] }
  try {
    const html = render(battle)
    assert.match(html, /Нужно 30 фанатов и победа над предыдущим соперником/)
    assert.match(html, /class="opp locked"/)
  } finally { ctx.profile = saved }
})

test('profile retains original player and pet art, progression and companion actions', () => {
  const html = render(profile)
  assert.match(html, /\/player\/freshman\.png/)
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
