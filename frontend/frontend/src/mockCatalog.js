// КАТАЛОГ ДЛЯ МОКА. Все вещи, цены и бонусы здесь заглушки: автор игры заменит их своими.
// Позже тот же каталог переезжает в таблицы БД (см. API-PROPOSAL.md), а этот файл больше не нужен.
//
// Типы бонусов (bonus.type):
//   income_pct      +N% к доходу от сниппетов (прослушивания и монеты)
//   popularity_pct  +N% к росту популярности
//   charisma        +N к харизме (показывается, в расчёт батла пока не входит)

export const START_COINS = 300

export const BEATS = [
  { id: 1, name: 'Бит 1: Дрилл', base_streams: 100 },
  { id: 2, name: 'Бит 2: Трэп', base_streams: 140 },
]

export const EQUIPMENT = [
  { id: 1, name: 'Наушники', icon: 'headphones', price: 500, bonus: { type: 'income_pct', value: 10 } },
  { id: 2, name: 'Студийный микрофон', icon: 'mic', price: 1500, bonus: { type: 'income_pct', value: 20 } },
  { id: 3, name: 'Звуковая карта', icon: 'box', price: 3000, bonus: { type: 'income_pct', value: 30 } },
  { id: 4, name: 'Студийные мониторы', icon: 'headphones', price: 6000, bonus: { type: 'income_pct', value: 40 } },
]

// slot: hat | hoodie | pants | shoe | chain (как в слотах гардероба)
// price: null значит «в магазине не продаётся, только из паков»
// image: путь к PNG-слою для манекена (например '/clothes/cap.png'), пока null
export const CLOTHING = [
  { id: 1, slot: 'hat', name: 'Винтажная бейсболка', rarity: 'common', price: 500, image: null,
    description: 'Выцветшая кепка со двора.', bonus: { type: 'income_pct', value: 3 } },
  { id: 2, slot: 'hat', name: 'Чёрная шапка', rarity: 'rare', price: null, image: null,
    description: 'Тёплая шапка без надписей.', bonus: { type: 'popularity_pct', value: 10 } },
  { id: 3, slot: 'hoodie', name: 'Чёрное худи', rarity: 'common', price: 800, image: null,
    description: 'Базовое худи на каждый день.', bonus: { type: 'popularity_pct', value: 5 } },
  { id: 4, slot: 'pants', name: 'Карго', rarity: 'common', price: 600, image: null,
    description: 'Широкие штаны с карманами.', bonus: { type: 'charisma', value: 1 } },
  { id: 5, slot: 'shoe', name: 'Белые кроссовки', rarity: 'common', price: 700, image: null,
    description: 'Чистые до первой лужи.', bonus: { type: 'income_pct', value: 3 } },
  { id: 6, slot: 'chain', name: 'Цепь-звено', rarity: 'rare', price: 2500, image: null,
    description: 'Тяжёлая цепь на шею.', bonus: { type: 'income_pct', value: 10 } },
  { id: 7, slot: 'chain', name: 'Золотая цепь', rarity: 'epic', price: null, image: null,
    description: 'Выпадает редко.', bonus: { type: 'income_pct', value: 20 } },
]

export const PACKS = [{ id: 1, name: 'Базовый пак', price: 200, clothing_chance: 0.07 }]

// Стартовая колода игрока (id карточек). Остальные карточки добываются в паках.
export const START_CARD_IDS = [
  140, 101, 102, 104, 105, 141, 111, 112, 113, 115, 143, 121, 122, 124, 125, 131, 132, 133, 134,
]
