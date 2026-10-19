// ВСЕ обращения к серверу идут через этот файл (docs/api.md).
// Слово `supabase` допустимо только здесь и в src/supabase.js.
//
// MOCK[имя] = true  -> фейковый ответ (логика мок-сервера живёт ниже в этом файле)
// MOCK[имя] = false -> настоящий вызов серверной функции
// Если ключей Supabase нет в .env, любая функция работает на фейке.
import { supabase } from './supabase'
import { BEATS, EQUIPMENT, CLOTHING, PACKS, START_CARD_IDS, START_COINS } from './mockCatalog'

export const MOCK = {
  login: true,
  getProfile: true,
  getHand: true,
  startBattle: true,
  submitRound: true,
  // Новые функции ждут согласования API (см. API-PROPOSAL.md), пока только мок.
  getStudio: true,
  recordSnippet: true,
  selectBeat: true,
  getShop: true,
  buyItem: true,
  getWardrobe: true,
  equipItem: true,
  openPack: true,
  getDeck: true,
}

export class ApiError extends Error {
  constructor(code, message, network = false) {
    super(message || code)
    this.code = code
    this.network = network
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = (a, b) => a + Math.random() * (b - a)
const rndInt = (a, b) => Math.floor(rnd(a, b + 1))
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)))
const useMock = (name) => MOCK[name] || !supabase

// Общий вызов серверной функции. initData добавляется в каждый запрос.
async function call(name, body) {
  const initData = window.Telegram?.WebApp?.initData || ''
  let res
  try {
    res = await supabase.functions.invoke(name, { body: { initData, ...body } })
  } catch {
    throw new ApiError('INTERNAL', 'network', true)
  }
  const { data, error } = res
  if (error) {
    // Ошибка формата { error: { code } } может прийти с не-200 статусом.
    try {
      const payload = await error.context?.json?.()
      if (payload?.error?.code) throw new ApiError(payload.error.code, payload.error.message)
    } catch (e) {
      if (e instanceof ApiError) throw e
    }
    throw new ApiError('INTERNAL', 'network', true)
  }
  if (data?.error) throw new ApiError(data.error.code, data.error.message)
  return data
}

// ---------------------------------------------------------------------------
// Публичные функции (формат ответов 1-в-1 как в docs/api.md)
// ---------------------------------------------------------------------------

// nickname нужен только мок-ветке. В docs/api.md у login пока нет поля для ника
// (ник берётся из Telegram), поэтому на сервер он не отправляется.
export async function login(nickname) {
  if (useMock('login')) {
    await wait(rndInt(300, 600))
    return mock.login(nickname)
  }
  return call('login', {})
}

export async function getProfile() {
  if (useMock('getProfile')) {
    await wait(rndInt(300, 500))
    return mock.getProfile()
  }
  return call('get-profile', {})
}

export async function getHand(battleId) {
  if (useMock('getHand')) {
    await wait(rndInt(300, 500))
    return mock.getHand(battleId)
  }
  return call('get-hand', { battleId })
}

export async function startBattle(opponentId) {
  if (useMock('startBattle')) {
    await wait(rndInt(400, 600))
    return mock.startBattle(opponentId)
  }
  return call('start-battle', { opponentId })
}

// cardIds строго в порядке слотов: [setup, development, boost, punch]
export async function submitRound(battleId, roundNumber, cardIds) {
  if (useMock('submitRound')) {
    await wait(rndInt(900, 1500)) // «Судья думает…»
    return mock.submitRound(battleId, roundNumber, cardIds)
  }
  return call('submit-round', { battleId, roundNumber, cardIds })
}

// ---------------------------------------------------------------------------
// Предложенные функции (API-PROPOSAL.md). Имена серверных функций пока не утверждены.
// ---------------------------------------------------------------------------
const proposed = (key, fnName, body, mockFn, ms = [300, 500]) => async () => {
  if (useMock(key)) {
    await wait(rndInt(...ms))
    return mockFn()
  }
  return call(fnName, body)
}

export const getStudio = () => proposed('getStudio', 'get-studio', {}, () => mock2.getStudio())()
export const recordSnippet = (taps) =>
  proposed('recordSnippet', 'record-snippet', { taps }, () => mock2.recordSnippet(taps), [200, 400])()
export const selectBeat = (beatId) =>
  proposed('selectBeat', 'select-beat', { beatId }, () => mock2.selectBeat(beatId))()
export const getShop = () => proposed('getShop', 'get-shop', {}, () => mock2.getShop())()
// kind: 'equipment' | 'clothing'
export const buyItem = (kind, itemId) =>
  proposed('buyItem', 'buy-item', { kind, itemId }, () => mock2.buyItem(kind, itemId))()
export const getWardrobe = () => proposed('getWardrobe', 'get-wardrobe', {}, () => mock2.getWardrobe())()
// itemId = null снимает вещь со слота
export const equipItem = (slot, itemId) =>
  proposed('equipItem', 'equip-item', { slot, itemId }, () => mock2.equipItem(slot, itemId))()
export const openPack = (packId) =>
  proposed('openPack', 'open-pack', { packId }, () => mock2.openPack(packId), [700, 1000])()
export const getDeck = () => proposed('getDeck', 'get-deck', {}, () => mock2.getDeck())()

// ===========================================================================
// МОК-СЕРВЕР. Здесь (и только здесь) живёт игровая логика на время разработки.
// Когда бэкенд готов, переключаем MOCK.<имя> на false, и этот блок не вызывается.
// ===========================================================================

const SLOT_CODES = ['setup', 'development', 'boost', 'punch']
const THEMES = ['деньги', 'улица', 'ирония']

const syl = (t) => (t.match(/[аеёиоуыэюя]/gi) || []).length

// id, слот, текст, тема, редкость, бонус (flat_points)
const POOL = [
  [140, 'setup', 'Ты в бою как нищий — пустой кошелёк', 'деньги', 'common'],
  [101, 'setup', 'Я выхожу на бит, и район затих', 'улица', 'common'],
  [102, 'setup', 'Ты зовёшь это рэпом? Смешно, брат', 'ирония', 'common'],
  [103, 'setup', 'Ты копил на микрофон — я его купил', 'деньги', 'rare', 2],
  [104, 'setup', 'Мой двор тебя помнит как фоновый шум', 'улица', 'common'],
  [105, 'setup', 'Твой стиль — как реклама перед видео', 'ирония', 'common'],
  [106, 'setup', 'Ты пришёл за славой, а я уже тут', 'улица', 'rare', 2],
  [107, 'setup', 'Твой кошелёк тоньше, чем твой куплет', 'деньги', 'epic', 4],

  [141, 'development', 'А я на сцене — ты просто игрок', 'деньги', 'common'],
  [111, 'development', 'Каждый мой куплет — как удар по басам', 'улица', 'common'],
  [112, 'development', 'Ты читаешь с листа, а я с головы', 'ирония', 'common'],
  [113, 'development', 'У меня в кармане мелочь и мечта', 'деньги', 'common'],
  [114, 'development', 'Ты на разогреве, я уже в огне', 'улица', 'rare', 2],
  [115, 'development', 'Твои рифмы старше моих кроссовок', 'ирония', 'common'],
  [116, 'development', 'Я копил на бит, пока ты спал', 'деньги', 'rare', 2],
  [117, 'development', 'Твой микрофон звучит как чайник', 'ирония', 'epic', 4],

  [143, 'boost', 'Ты копишь на кроссы, я кручу бабки', 'деньги', 'common'],
  [121, 'boost', 'Район мне подпевает — я здесь свой', 'улица', 'common'],
  [122, 'boost', 'Твой флоу тормозит, как автобус в снег', 'ирония', 'common'],
  [123, 'boost', 'Мне платят за строчки, тебе — за «лайк»', 'деньги', 'rare', 2],
  [124, 'boost', 'Тут каждый знает, кто держит район', 'улица', 'common'],
  [125, 'boost', 'Ты хайпуешь, а я просто пишу', 'ирония', 'common'],
  [126, 'boost', 'Мой гонорар длиннее твоего трека', 'деньги', 'epic', 4],
  [127, 'boost', 'С моим куплетом ты как на ринге', 'улица', 'rare', 2],

  [142, 'punch', 'Твой флоу, бро, — домашние тапки', 'ирония', 'rare', 3],
  [131, 'punch', 'Ты рэпер на пенсии — раньше начала', 'ирония', 'common'],
  [132, 'punch', 'Мой кошелёк толще, чем твой словарь', 'деньги', 'common'],
  [133, 'punch', 'Тебя не слышно даже в наушниках', 'ирония', 'common'],
  [134, 'punch', 'Мой двор — твой потолок', 'улица', 'common'],
  [135, 'punch', 'С тобой рифмуется только «провал»', 'ирония', 'rare', 3],
  [136, 'punch', 'Твой долг растёт быстрее просмотров', 'деньги', 'rare', 3],
  [137, 'punch', 'Ты тут проездом, а я прописан', 'улица', 'epic', 5],
].map(([id, slot, text, theme, rarity, bonus]) => ({
  slot,
  card: {
    id,
    text,
    theme,
    rarity,
    syllables: syl(text),
    ...(bonus ? { bonus: { type: 'flat_points', value: bonus } } : {}),
  },
}))

const CARD_BY_ID = Object.fromEntries(POOL.map((p) => [p.card.id, p]))

// Строчки ботов по темам (заготовки). Для темы «деньги» взяты из docs/api.md.
const BOT_LINES = {
  деньги: [
    'Деньги — пыль, я вырос на районе',
    'А ты рос в тепле и на балконе',
    'Я голодным лез на каждый сход',
    'А ты ждал, что мамка принесёт',
  ],
  улица: [
    'Мой район — моя школа и ринг',
    'Тут каждый куплет — как бой без правил',
    'Я вырос там, где гаснет свет в окне',
    'А ты читаешь, чтоб тебя заметили',
  ],
  ирония: [
    'Ты читаешь рэп как инструкцию к чайнику',
    'Скучно так, что бит ушёл покурить',
    'Твой панч прилетел в мой чёрный список',
    'А я и не заметил, что ты был',
  ],
}

const OPPONENTS = [
  { id: 1, name: 'МС Подвал', style: 'Дворовый, грубоватый', level: 1, location: 'Двор', required: 0 },
  { id: 2, name: 'Лёха Бит', style: 'Ритмичный, дерзкий', level: 2, location: 'Двор', required: 30 },
  { id: 3, name: 'Тихий Рейв', style: 'Мрачный, заумный', level: 3, location: 'Клуб', required: 100 },
  { id: 4, name: 'DJ Кассета', style: 'Старая школа, ироничный', level: 4, location: 'Клуб', required: 200 },
  { id: 5, name: 'Босс Фестиваля', style: 'Уверенный хедлайнер', level: 5, location: 'Фестиваль', required: 400 },
]

const xpToNext = (level) => Math.round(100 * Math.pow(1.1, level - 1))

const db = {
  player: null,
  stats: { battles_played: 0, wins: 0, losses: 0 },
  recent: [],
  battles: {},
  studio: {
    hype: 0,
    energy: 100,
    ts: Date.now(),
    beat: 1,
    equipment: [],
    clothing: [],
    outfit: { hat: null, hoodie: null, pants: null, shoe: null, chain: null },
    cards: new Set(START_CARD_IDS),
  },
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Случайная одежда соперника из всей библиотеки. Только внешний вид: бонусов у неё нет,
// в расчёты она не входит (pctOf смотрит только на одежду игрока).
function randomOutfit() {
  const slots = ['hat', 'hoodie', 'pants', 'shoe', 'chain']
  const look = ({ id, name, image }) => ({ id, name, image }) // только внешний вид, без бонуса
  const pick = (slot) => {
    const list = CLOTHING.filter((c) => c.slot === slot)
    return list.length ? look(list[rndInt(0, list.length - 1)]) : null
  }
  const out = {}
  for (const slot of slots) out[slot] = Math.random() < 0.8 ? pick(slot) : null
  // соперник никогда не выходит совсем раздетым: минимум три вещи
  for (const slot of shuffle(slots)) {
    if (Object.values(out).filter(Boolean).length >= 3) break
    if (!out[slot]) out[slot] = pick(slot)
  }
  return out
}

// Рука: 4-6 случайных карточек на каждый слот из карточек игрока
function makeHand() {
  const hand = {}
  for (const slot of SLOT_CODES) {
    const cards = POOL.filter((p) => p.slot === slot && db.studio.cards.has(p.card.id)).map((p) => p.card)
    hand[slot] = shuffle(cards).slice(0, rndInt(4, 6))
  }
  return hand
}

const clamp = (x, a = 0, b = 10) => Math.max(a, Math.min(b, x))
const half = (x) => Math.round(x * 2) / 2

function scorePlayer(cards, theme) {
  const lines = cards.map((c) => c.text)
  const tail = (s) => s.toLowerCase().replace(/[^а-яё]/g, '').slice(-2)
  const pairs = [[0, 1], [2, 3]]
  let rhyme = 4
  for (const [a, b] of pairs) {
    const ta = tail(lines[a])
    const tb = tail(lines[b])
    if (ta === tb) rhyme += 3
    else if (ta.slice(-1) === tb.slice(-1)) rhyme += 1.5
  }
  const s = cards.map((c) => c.syllables)
  const flow = 10 - (Math.max(...s) - Math.min(...s)) * 1.2
  const base = { common: 5, rare: 6.5, epic: 8 }[cards[3].rarity]
  const punch = base + (cards[3].theme === theme ? 1.5 : 0) + rnd(0, 1.2)
  const matches = cards.filter((c) => c.theme === theme).length
  const meaning = 4 + matches * 1.2 + rnd(0, 1.2)
  const scores = {
    rhyme: half(clamp(rhyme + rnd(0, 1))),
    flow: half(clamp(flow, 3, 10)),
    punch: half(clamp(punch)),
    meaning: half(clamp(meaning)),
  }
  const bonus = cards.reduce((n, c) => n + (c.bonus?.type === 'flat_points' ? c.bonus.value : 0), 0)
  return { lines, scores, points: pts(scores) + bonus }
}

function pts(s) {
  return Math.round((s.rhyme * 0.25 + s.flow * 0.25 + s.punch * 0.3 + s.meaning * 0.2) * 10)
}

function scoreBot(level, theme) {
  const base = 4.5 + level * 0.6
  const g = () => half(clamp(base + rnd(-1.5, 1.5)))
  const scores = { rhyme: g(), flow: g(), punch: g(), meaning: g() }
  return { lines: BOT_LINES[theme] || BOT_LINES['деньги'], scores, points: pts(scores) }
}

function judgeComment(scores) {
  const names = { rhyme: 'рифма', flow: 'флоу', punch: 'панч', meaning: 'смысл' }
  const keys = Object.keys(scores)
  const best = keys.reduce((a, b) => (scores[b] > scores[a] ? b : a))
  const worst = keys.reduce((a, b) => (scores[b] < scores[a] ? b : a))
  if (best === worst) return 'Ровная строчка: все критерии на одном уровне.'
  return `Сильнее всего ${names[best]}, слабее всего ${names[worst]}.`
}

function popFloor() {
  const p = db.player.popularity
  return Math.max(0, ...OPPONENTS.filter((o) => p >= o.required).map((o) => o.required))
}

const mock = {
  login(nickname) {
    const is_new = !db.player
    if (is_new) {
      db.player = {
        id: uuid(),
        username: nickname || 'player',
        avatar: 'default',
        level: 1,
        xp: 0,
        xp_to_next: xpToNext(1),
        popularity: 0,
        coins: START_COINS,
        streams: 0,
        skills: { rhyme: 1, flow: 1, punch: 1, charisma: 1 },
        ai_requests_left: 20,
      }
    } else if (nickname) {
      db.player.username = nickname
    }
    return { is_new, player: clone(db.player) }
  },

  getProfile() {
    if (!db.player) throw new ApiError('PLAYER_NOT_FOUND')
    return {
      player: clone(db.player),
      stats: clone(db.stats),
      recent_battles: clone(db.recent.slice(0, 5)),
      opponents: OPPONENTS.map((o) => {
        const unlocked = db.player.popularity >= o.required
        return {
          id: o.id,
          name: o.name,
          level: o.level,
          location: o.location,
          unlocked,
          ...(unlocked ? {} : { required_popularity: o.required }),
        }
      }),
    }
  },

  getHand(battleId) {
    if (!db.player) throw new ApiError('PLAYER_NOT_FOUND')
    const b = db.battles[battleId]
    if (!b) throw new ApiError('BATTLE_NOT_FOUND')
    if (b.status === 'finished') throw new ApiError('BATTLE_FINISHED')
    return { cards: clone(b.hand) }
  },

  startBattle(opponentId) {
    if (!db.player) throw new ApiError('PLAYER_NOT_FOUND')
    const opp = OPPONENTS.find((o) => o.id === opponentId)
    if (!opp) throw new ApiError('INTERNAL')
    if (db.player.popularity < opp.required) throw new ApiError('OPPONENT_LOCKED')
    const id = uuid()
    const b = {
      id,
      status: 'active',
      opp,
      themes: shuffle(THEMES),
      outfit: randomOutfit(),
      round: 1,
      pw: 0,
      ow: 0,
      ptotal: 0,
      ototal: 0,
      hand: makeHand(),
    }
    db.battles[id] = b
    return {
      battle: {
        id,
        status: 'active',
        opponent: { id: opp.id, name: opp.name, style: opp.style, level: opp.level, outfit: clone(b.outfit) },
        player_rounds_won: 0,
        opponent_rounds_won: 0,
      },
      round: { number: 1, theme: b.themes[0] },
      hand: clone(b.hand),
    }
  },

  submitRound(battleId, roundNumber, cardIds) {
    if (!db.player) throw new ApiError('PLAYER_NOT_FOUND')
    const b = db.battles[battleId]
    if (!b) throw new ApiError('BATTLE_NOT_FOUND')
    if (b.status === 'finished') throw new ApiError('BATTLE_FINISHED')
    if (roundNumber < b.round) throw new ApiError('ROUND_ALREADY_SUBMITTED')
    if (roundNumber !== b.round) throw new ApiError('INVALID_ROUND')
    if (!Array.isArray(cardIds) || cardIds.length !== 4) throw new ApiError('INVALID_CARDS')
    if (db.player.ai_requests_left <= 0) throw new ApiError('DAILY_LIMIT')

    const cards = cardIds.map((id, i) => {
      const inSlot = b.hand[SLOT_CODES[i]].find((c) => c.id === id)
      if (inSlot) return inSlot
      const elsewhere = SLOT_CODES.some((s) => b.hand[s].some((c) => c.id === id))
      throw new ApiError(elsewhere ? 'INVALID_CARDS' : 'CARD_NOT_OWNED')
    })
    if (new Set(cardIds).size !== 4) throw new ApiError('INVALID_CARDS')

    const theme = b.themes[b.round - 1]
    const player = scorePlayer(cards, theme)
    player.comment = judgeComment(player.scores)
    const opponent = scoreBot(b.opp.level, theme)
    const winner =
      player.points > opponent.points ? 'player' : player.points < opponent.points ? 'opponent' : 'draw'

    db.player.ai_requests_left -= 1
    if (winner === 'player') b.pw += 1
    if (winner === 'opponent') b.ow += 1
    b.ptotal += player.points
    b.ototal += opponent.points

    const round = { number: b.round, theme, player, opponent, winner }
    const done = b.pw >= 2 || b.ow >= 2 || b.round >= 3

    if (!done) {
      b.round += 1
      b.hand = makeHand()
      return {
        round,
        battle: { status: 'active', player_rounds_won: b.pw, opponent_rounds_won: b.ow },
        next_round: { number: b.round, theme: b.themes[b.round - 1] },
        hand: clone(b.hand),
        rewards: null,
        ai_requests_left: db.player.ai_requests_left,
      }
    }

    // Батл закончен. Если после 3 раундов равенство, решают суммарные очки.
    const win = b.pw !== b.ow ? b.pw > b.ow : b.ptotal >= b.ototal
    b.status = 'finished'
    const rewards = applyRewards(win)
    db.stats.battles_played += 1
    db.stats[win ? 'wins' : 'losses'] += 1
    db.recent.unshift({
      id: b.id,
      opponent_name: b.opp.name,
      result: win ? 'win' : 'loss',
      created_at: new Date().toISOString(),
    })
    return {
      round,
      battle: {
        status: 'finished',
        result: win ? 'win' : 'loss',
        player_rounds_won: b.pw,
        opponent_rounds_won: b.ow,
      },
      next_round: null,
      hand: null,
      rewards,
      ai_requests_left: db.player.ai_requests_left,
    }
  },
}

function applyRewards(win) {
  const p = db.player
  const xp_change = win ? 25 : -rndInt(10, 15)
  const popularity_change = win ? 15 : -rndInt(5, 10)
  const floor = popFloor()
  const boosted = win ? Math.round(popularity_change * (1 + pctOf('popularity_pct') / 100)) : popularity_change
  p.popularity = Math.max(floor, p.popularity + boosted)
  p.xp = Math.max(0, p.xp + xp_change)
  let level_up = false
  while (p.xp >= p.xp_to_next) {
    p.xp -= p.xp_to_next
    p.level += 1
    p.xp_to_next = xpToNext(p.level)
    level_up = true
    const k = ['rhyme', 'flow', 'punch', 'charisma'][rndInt(0, 3)]
    p.skills[k] += 1
  }
  if (win) p.coins += 50
  return { xp_change, popularity_change: boosted, level_up, new_level: p.level }
}

// ---------------------------------------------------------------------------
// Мок новых механик: сниппеты, оборудование, одежда, паки. Числа временные.
// ---------------------------------------------------------------------------
const ENERGY_MAX = 100
const HYPE_MAX = 50
const REGEN_MS = 3000
const RARITY_W = { common: 70, rare: 24, epic: 6 }
const DUP_REFUND = { common: 20, rare: 60, epic: 150 }

function pctOf(type) {
  const st = db.studio
  const sum = (list) => list.reduce((n, x) => n + (x.bonus.type === type ? x.bonus.value : 0), 0)
  return (
    sum(EQUIPMENT.filter((e) => st.equipment.includes(e.id))) +
    sum(CLOTHING.filter((c) => Object.values(st.outfit).includes(c.id)))
  )
}

function regen() {
  const st = db.studio
  const now = Date.now()
  if (st.energy >= ENERGY_MAX) {
    st.ts = now
    return
  }
  const gain = Math.floor((now - st.ts) / REGEN_MS)
  if (gain > 0) {
    st.energy = Math.min(ENERGY_MAX, st.energy + gain)
    st.ts += gain * REGEN_MS
  }
}

const eqView = (e) => ({ id: e.id, name: e.name, price: e.price, bonus: e.bonus, owned: db.studio.equipment.includes(e.id) })
const clView = (c) => ({
  id: c.id,
  slot: c.slot,
  name: c.name,
  rarity: c.rarity,
  price: c.price,
  image: c.image,
  thumb: c.thumb,
  description: c.description,
  bonus: c.bonus,
  owned: db.studio.clothing.includes(c.id),
})

function studioView() {
  const st = db.studio
  return {
    hype: st.hype,
    hype_max: HYPE_MAX,
    energy: st.energy,
    energy_max: ENERGY_MAX,
    selected_beat_id: st.beat,
    beats: BEATS.map((b) => ({ id: b.id, name: b.name })),
    equipment: EQUIPMENT.map(eqView),
    income_pct: pctOf('income_pct'),
  }
}

const bonuses = () => ({
  income_pct: pctOf('income_pct'),
  popularity_pct: pctOf('popularity_pct'),
  charisma: pctOf('charisma'),
})

const need = () => {
  if (!db.player) throw new ApiError('PLAYER_NOT_FOUND')
}

const mock2 = {
  getStudio() {
    need()
    regen()
    return { player: clone(db.player), studio: studioView() }
  },

  recordSnippet(taps) {
    need()
    if (!Number.isInteger(taps) || taps < 1) throw new ApiError('INTERNAL')
    regen()
    const st = db.studio
    if (st.energy <= 0) throw new ApiError('NO_ENERGY')
    const use = Math.min(taps, st.energy, 200)
    st.energy -= use
    st.hype += use
    const released = []
    while (st.hype >= HYPE_MAX) {
      st.hype -= HYPE_MAX
      const beat = BEATS.find((b) => b.id === st.beat)
      const p = db.player
      const streams = Math.round(beat.base_streams * (1 + p.popularity / 200) * (1 + pctOf('income_pct') / 100))
      const coins = Math.round(streams / 10)
      const popularity_change = Math.max(1, Math.round(streams / 100))
      p.streams += streams
      p.coins += coins
      p.popularity += popularity_change
      released.push({ streams, coins, popularity_change })
    }
    return { player: clone(db.player), studio: studioView(), released }
  },

  selectBeat(beatId) {
    need()
    if (!BEATS.some((b) => b.id === beatId)) throw new ApiError('ITEM_NOT_FOUND')
    db.studio.beat = beatId
    regen()
    return { player: clone(db.player), studio: studioView() }
  },

  getShop() {
    need()
    return {
      player: clone(db.player),
      equipment: EQUIPMENT.map(eqView),
      clothing: CLOTHING.filter((c) => c.price != null).map(clView),
      packs: PACKS.map((p) => ({ id: p.id, name: p.name, price: p.price })),
    }
  },

  buyItem(kind, itemId) {
    need()
    const st = db.studio
    const list = kind === 'equipment' ? EQUIPMENT : kind === 'clothing' ? CLOTHING : null
    const item = list?.find((x) => x.id === itemId)
    if (!item || item.price == null) throw new ApiError('ITEM_NOT_FOUND')
    const owned = kind === 'equipment' ? st.equipment : st.clothing
    if (owned.includes(itemId)) throw new ApiError('ALREADY_OWNED')
    if (db.player.coins < item.price) throw new ApiError('NOT_ENOUGH_COINS')
    db.player.coins -= item.price
    owned.push(itemId)
    return { player: clone(db.player), item: kind === 'equipment' ? eqView(item) : clView(item) }
  },

  getWardrobe() {
    need()
    return {
      player: clone(db.player),
      items: CLOTHING.filter((c) => db.studio.clothing.includes(c.id)).map(clView),
      outfit: clone(db.studio.outfit),
      bonuses: bonuses(),
    }
  },

  equipItem(slot, itemId) {
    need()
    const st = db.studio
    if (!(slot in st.outfit)) throw new ApiError('ITEM_NOT_FOUND')
    if (itemId != null) {
      const item = CLOTHING.find((c) => c.id === itemId)
      if (!item || item.slot !== slot) throw new ApiError('ITEM_NOT_FOUND')
      if (!st.clothing.includes(itemId)) throw new ApiError('NOT_OWNED')
    }
    st.outfit[slot] = itemId
    return { player: clone(db.player), outfit: clone(st.outfit), bonuses: bonuses() }
  },

  openPack(packId) {
    need()
    const pack = PACKS.find((p) => p.id === packId)
    if (!pack) throw new ApiError('ITEM_NOT_FOUND')
    const st = db.studio
    if (db.player.coins < pack.price) throw new ApiError('NOT_ENOUGH_COINS')
    db.player.coins -= pack.price

    const freeClothes = CLOTHING.filter((c) => !st.clothing.includes(c.id))
    let drop
    if (Math.random() < pack.clothing_chance && freeClothes.length) {
      const c = freeClothes[rndInt(0, freeClothes.length - 1)]
      st.clothing.push(c.id)
      drop = { type: 'clothing', item: clView(c), duplicate: false, refund: 0 }
    } else {
      const fresh = POOL.filter((p) => !st.cards.has(p.card.id))
      const cand = fresh.length ? fresh : POOL
      const total = cand.reduce((n, p) => n + RARITY_W[p.card.rarity], 0)
      let roll = Math.random() * total
      let pick = cand[0]
      for (const p of cand) {
        roll -= RARITY_W[p.card.rarity]
        if (roll <= 0) {
          pick = p
          break
        }
      }
      const duplicate = st.cards.has(pick.card.id)
      const refund = duplicate ? DUP_REFUND[pick.card.rarity] : 0
      st.cards.add(pick.card.id)
      db.player.coins += refund
      drop = { type: 'card', card: { ...pick.card, slot: pick.slot }, duplicate, refund }
    }
    return { player: clone(db.player), drop }
  },

  getDeck() {
    need()
    return {
      cards: POOL.filter((p) => db.studio.cards.has(p.card.id)).map((p) => ({ ...p.card, slot: p.slot })),
    }
  },
}
