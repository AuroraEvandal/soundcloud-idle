// shortcut: this standalone prototype uses temporary demo state; move judging and money to the server before release.
export const DURATION = 180
export const BEAT = .5
export const EPISODES = [
  { title: 'Пока горит свет', artist: 'ЛЕВЫЙ БЕРЕГ', track: 'Не выключай', venue: 'Клуб «Контур»', crowd: 38, color: '#ff641a',
    line: 'Тридцать восемь человек. Для кого-то — пустой зал. Для него — первый настоящий концерт.',
    owner: 'Ирина · владелица', dialogue: 'В понедельник нам отключат электричество. Сегодня нужно показать, что этот подвал ещё кому-то нужен. И не включай чайник: он на одной линии с басом.',
    dilemma: 'Левый Берег просит открыть концерт новым, ещё не сведённым треком. Ирина положила на пульт сет-лист с проверенным хитом.',
    choiceA: 'Довериться артисту', choiceB: 'Держаться сет-листа',
    artistReply: '«Если голос провалится — оставь клавиши. Я договорю». Он впервые смотрит тебе в глаза.',
    ownerReply: '«Спасибо. Один надёжный вечер нам сейчас нужнее революции». Ирина уходит проверять дверь.',
    midway: 'Ирина: «Чайник всё-таки включили. Нет, это не часть райдера».' },
  { title: 'Человек за стеной', artist: 'ЛЕВЫЙ БЕРЕГ', track: 'Соседи не спят', venue: 'Клуб «Контур»', crowd: 64, color: '#ff872e',
    line: 'Про вчерашний вечер написали в районном паблике. Сегодня пришёл человек, который раньше играл здесь сам.',
    owner: 'Ника · звукорежиссёр', dialogue: 'Я делала здесь звук десять лет назад. Тогда пульт тоже грелся. Не переживай: запах пыли — это нормально. Запах карамели — уже нет.',
    dilemma: 'Ника предлагает оставить голос сухим. Артист хочет много эха, чтобы скрыть дрожь.',
    choiceA: 'Оставить артисту эхо', choiceB: 'Сделать голос ближе',
    artistReply: '«Пока мне так спокойнее». Он перестаёт теребить кабель.', ownerReply: '«Он справится и без тумана». Ника оставляет тебе свои наушники.',
    midway: 'Ника: «Это не дым-машина. Кто-то сушит носки на усилителе».' },
  { title: 'Не по бумажке', artist: 'АРЛЕКИН', track: 'Право на шум', venue: 'Бар «Нижний»', crowd: 110, color: '#ff5500',
    line: 'Первое приглашение на чужую площадку. В гримёрке уже спорят, кому принадлежит сцена.',
    owner: 'Ирина · владелица', dialogue: 'Арлекин привёл людей, но хочет переделать программу. У нас договор с баром. У него — ощущение момента. Попробуй сохранить и то и другое.',
    dilemma: 'Посреди сета он собирается отдать микрофон неизвестному парню из зала.',
    choiceA: 'Дать гостю шанс', choiceB: 'Сохранить программу',
    artistReply: '«Вот ради этого я и выхожу». Он убирает второй микрофон со стойки.', ownerReply: '«Тогда сделаем так, чтобы они запомнили этот сет». Он соглашается без улыбки.',
    midway: 'Администратор: «В райдере написано “живой бас”. Кто принёс рыбу?»' },
  { title: 'Места закончились', artist: 'ЛЕВЫЙ БЕРЕГ', track: 'Весь наш город', venue: 'Клуб «Контур»', crowd: 180, color: '#ffab49',
    line: 'Очередь впервые вышла на улицу. Теперь страшно потерять то, что ещё неделю назад казалось невозможным.',
    owner: 'Ника · звукорежиссёр', dialogue: 'Больше людей — меньше пустоты в звуке. Не пытайся победить их громкостью. Пусть сами станут частью трека.',
    dilemma: 'Зал уже поёт припев. Артист просит выключить его дорожку и оставить людей одних.',
    choiceA: 'Довериться залу', choiceB: 'Поддержать дорожкой',
    artistReply: 'Он снимает наушник. «Слышишь? У нас получилось».', ownerReply: 'Ника кивает: «Подстраховать — тоже работа. Только не прячь людей».',
    midway: 'Ирина: «Очередь в гардероб скандирует имя гардеробщика. Не отвлекайся».' },
  { title: 'Один человек в зале', artist: 'АРЛЕКИН', track: 'Без гарантий', venue: 'Сцена «Цех»', crowd: 320, color: '#ff713d',
    line: 'Организатор фестиваля не обещал прийти. Но человек с его фотографией уже стоит у задней стены.',
    owner: 'Ирина · владелица', dialogue: 'Если он позовёт нас на фестиваль, клуб переживёт зиму. Но я не хочу, чтобы вы весь вечер играли для одного человека.',
    dilemma: 'Менеджер предлагает убрать рискованный финал: «Для заявки хватит ровного звука».',
    choiceA: 'Оставить живой финал', choiceB: 'Сделать чистый сет',
    artistReply: '«Если ошибёмся — хотя бы своим голосом». Арлекин возвращает старый сет-лист.', ownerReply: '«Хорошо. Тогда пусть каждая пауза работает». Он просит погасить половину света.',
    midway: 'Ника: «Человек у стены оказался электриком. Организатор — рядом с ним».' },
  { title: 'Последний сезон', artist: 'ЛЕВЫЙ БЕРЕГ × АРЛЕКИН', track: 'Контур остаётся', venue: 'Городской фестиваль', crowd: 1200, color: '#ff5500',
    line: 'Впервые за весь сезон ты не знаешь людей в первом ряду. Но свои всё равно здесь.',
    owner: 'Ника · звукорежиссёр', dialogue: 'Помнишь первый вечер? Ты боялся тронуть ручку громкости. Сегодня за тобой целая сцена. Я рядом. Но этот концерт — твой.',
    dilemma: 'В финале можно включить заранее записанный идеальный припев — или открыть микрофоны всей команды клуба.',
    choiceA: 'Открыть микрофоны', choiceB: 'Включить запись',
    artistReply: 'Ирина встаёт рядом с артистами. В её микрофоне слышно дыхание. «Ну что. Работаем?»', ownerReply: 'Запись готова. На сцене всё равно поют поверх неё. Ты оставляешь им место.',
    midway: 'Ирина: «Чайник я привезла. Он в гримёрке. Не подключён. Почти».' },
]
export const GEAR = [
  { id: 'marks', name: 'Метки на пульте', price: 250, icon: 'compose', description: 'Нужный канал заметнее. Меньше суеты в авариях.' },
  { id: 'knobs', name: 'Точные регуляторы', price: 450, icon: 'headphones', description: 'Зона настройки шире на 4 пункта.' },
  { id: 'guard', name: 'Защита от перегруза', price: 800, icon: 'lock', description: 'Смягчает первую ошибку каждого концерта.' },
  { id: 'effects', name: 'Панель эффектов', price: 1200, icon: 'cloud', description: 'Открывает эхо и фильтр для свободных переходов.' },
  { id: 'amber', name: 'Янтарный пульт', price: 300, icon: 'crown', description: 'Тёплая подсветка. Тот же звук, другое настроение.' },
]
export const MECHANICS = {
  frequency: { label: 'Убери гул', subtitle: 'Поверни ручку. Найди чистый голос и удержи 0,5 сек.', tag: 'ЧАСТОТА', icon: 'headphones' },
  level: { label: 'Поймай уровень', subtitle: 'Держи фейдер в движущейся зоне 1 секунду.', tag: 'ГРОМКОСТЬ', icon: 'cloud' },
  pads: { label: 'Собери бит', subtitle: 'Нажми подсвеченные пэды по порядку, попадая в пульс.', tag: 'СЭМПЛЕР', icon: 'cards' },
  crossfade: { label: 'Сведи треки', subtitle: 'Веди фейдер за меткой. Не бросай переход.', tag: 'ПЕРЕХОД', icon: 'cloud' },
  feedback: { label: 'Убери свист', subtitle: 'Найди перегруженный канал. Приглуши, затем верни.', tag: 'АВАРИЯ', icon: 'mic' },
  artist: { label: 'Дай залу спеть', subtitle: 'Убери голос на одну фразу, потом верни в пульс.', tag: 'КОМАНДА АРТИСТА', icon: 'person' },
}
export function initialCareer() { return { coins: 200, reputation: 0, completed: [], goals: [], upgrades: [], claimed: [], trust: 0, reliability: 0 } }
export function makeShow(episode, choice, upgrades = []) {
  const kinds = ['frequency', 'pads', 'level', 'feedback', 'crossfade', 'artist']
  const events = Array.from({ length: 24 }, (_, i) => {
    const kind = kinds[i % 6]
    return { id: `cue-${i}`, kind, at: 3 + i * 7, duration: 6.2, target: [63, 57, 70, 45][i % 4],
      moving: episode >= 2 && kind === 'level', channel: (i + episode) % 3,
      sequence: choice === 'artist' ? [0, 1, 2, 3] : [0, 1, 2],
      request: choice === 'artist' && i % 12 === 11 ? 'loop' : 'crowd',
      secondary: episode >= 2 && kind === 'level' && i >= 8 }
  })
  return { id: globalThis.crypto.randomUUID(), episode, choice, events, outcomes: {}, quality: 70, energy: 35, combo: 0, bestCombo: 0, misses: 0, assisted: false, guard: upgrades.includes('guard'), failed: false }
}
export function targetAt(event, elapsed) {
  if (event.kind === 'crossfade') return Math.min(95, 8 + Math.max(0, elapsed - event.at) / 4.5 * 87)
  return event.target + (event.moving ? Math.sin((elapsed - event.at) * 2) * 12 : 0)
}
export function timingResult(elapsed, offsetMs) {
  const beat = ((elapsed - offsetMs / 1000) % BEAT + BEAT) % BEAT
  const error = Math.min(beat, BEAT - beat)
  return error <= .09 ? 'perfect' : error <= .22 ? 'good' : 'miss'
}
export function resolveEvent(show, id, outcome) {
  const event = show.events.find(e => e.id === id)
  if (!event || Object.hasOwn(show.outcomes, id) || !['perfect', 'good', 'miss'].includes(outcome)) return show
  const failed = outcome === 'miss', guarded = failed && show.guard
  const quality = failed ? (event.kind === 'feedback' ? -12 : -7) : outcome === 'perfect' ? 3 : 1
  const combo = failed ? 0 : show.combo + 1, misses = failed ? show.misses + 1 : 0
  return { ...show, outcomes: { ...show.outcomes, [id]: outcome },
    quality: Math.max(0, Math.min(100, show.quality + (guarded ? -2 : quality) + (!failed && show.assisted ? 4 : 0))),
    energy: Math.max(0, Math.min(100, show.energy + (failed ? event.kind === 'feedback' ? -8 : -5 : outcome === 'perfect' ? 5 : 2))),
    combo, bestCombo: Math.max(combo, show.bestCombo), misses, assisted: misses >= 2, guard: show.guard && !guarded }
}
export function finishShow(career, show) {
  const points = Object.values(show.outcomes).reduce((sum, o) => sum + ({ perfect: 100, good: 70, miss: 0 }[o] || 0), 0)
  const accuracy = Math.round(points / show.events.length)
  const rank = show.failed ? '—' : accuracy >= 90 ? 'S' : accuracy >= 75 ? 'A' : accuracy >= 55 ? 'B' : 'C'
  const goal = !show.failed && show.bestCombo >= 6
  const first = !show.failed && !career.completed.includes(show.episode)
  const goalFirst = goal && !career.goals.includes(show.episode)
  const base = ({ S: 140, A: 120, B: 100, C: 80, '—': 30 }[rank])
  const bonus = (first ? 100 : 0) + (goalFirst ? 50 : 0)
  const reputation = ({ S: 25, A: 20, B: 15, C: 10, '—': 0 }[rank])
  const result = { rank, accuracy, base, bonus, reputation, goal, first, goalFirst }
  if (career.claimed.includes(show.id)) return { career, result: { ...result, bonus: 0 } }
  return { result, career: { ...career, coins: career.coins + base + bonus, reputation: career.reputation + reputation,
    completed: first ? [...career.completed, show.episode] : career.completed,
    goals: goalFirst ? [...career.goals, show.episode] : career.goals, claimed: [...career.claimed, show.id],
    trust: career.trust + (first && show.choice === 'artist' ? 1 : 0), reliability: career.reliability + (first && show.choice === 'owner' ? 1 : 0) } }
}
export function buyUpgrade(career, id) {
  const item = GEAR.find(g => g.id === id)
  if (!item || career.upgrades.includes(id) || career.coins < item.price) return career
  return { ...career, coins: career.coins - item.price, upgrades: [...career.upgrades, id] }
}
