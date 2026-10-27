// КАТАЛОГ ДЛЯ МОКА. Числа согласованы с docs/api.md (Экономика v0.2)
// и backend/seed.sql: одни и те же id и цены на моке и на сервере.
//
// Типы бонусов (bonus.type):
//   income_pct      +N% к доходу от сниппетов (прослушивания и монеты)
//   popularity_pct  +N% к росту популярности
//   charisma        +N к харизме (показывается, в расчёт батла пока не входит)

export const START_COINS = 300

// price 0 = бесплатный бит, куплен всем при регистрации.
// base_streams — стримы за один релиз до множителей.
export const BEATS = [
  { id: 1, name: 'Бит 1: Дрилл', base_streams: 150, price: 0 },
  { id: 2, name: 'Бит 2: Трэп', base_streams: 300, price: 800 },
  { id: 3, name: 'Бит 3: Фонк', base_streams: 500, price: 2500 },
  { id: 4, name: 'Бит 4: Хедлайнер', base_streams: 800, price: 6000 },
]

export const EQUIPMENT = [
  { id: 1, name: 'Наушники', icon: 'headphones', price: 200, bonus: { type: 'income_pct', value: 10 } },
  { id: 2, name: 'Студийный микрофон', icon: 'mic', price: 600, bonus: { type: 'income_pct', value: 20 } },
  { id: 3, name: 'Звуковая карта', icon: 'box', price: 1500, bonus: { type: 'income_pct', value: 30 } },
  { id: 4, name: 'Студийные мониторы', icon: 'headphones', price: 3500, bonus: { type: 'income_pct', value: 50 } },
]

// slot: hat | hoodie | pants | shoe | chain (как в слотах гардероба)
// price: null значит «в магазине не продаётся, только из паков»
// image: PNG-слой 512x1024 для манекена, thumb: маленькая иконка для списков (public/clothes/)
// Бонусы специально совсем небольшие. Все цифры временные, их меняет автор игры.
const C = (file) => ({ image: `/clothes/${file}.png`, thumb: `/clothes/${file}_thumb.png` })
export const CLOTHING = [
  { id: 1, slot: 'hat', name: 'Кепка «Бутта»', rarity: 'common', price: 300, ...C('cap1'),
    description: 'Белая кепка с готическим логотипом.', bonus: { type: 'income_pct', value: 3 } },
  { id: 2, slot: 'hoodie', name: 'Свитшот «ВРАГ»', rarity: 'common', price: 450, ...C('hoodie1'),
    description: 'Чёрный свитшот с красной надписью.', bonus: { type: 'popularity_pct', value: 7 } },
  { id: 3, slot: 'hoodie', name: 'Худи-маска', rarity: 'rare', price: 1500, ...C('hoodie3'),
    description: 'Чёрное худи на молнии с глухим капюшоном.', bonus: { type: 'income_pct', value: 5 } },
  { id: 4, slot: 'hoodie', name: 'Серое пальто', rarity: 'rare', price: 1800, ...C('coat1'),
    description: 'Длинное двубортное пальто.', bonus: { type: 'popularity_pct', value: 7 } },
  { id: 5, slot: 'pants', name: 'Джинсы с черепами', rarity: 'common', price: 500, ...C('jeans1'),
    description: 'Голубые джинсы с принтом из черепов.', bonus: { type: 'income_pct', value: 3 } },
  { id: 6, slot: 'pants', name: 'Чёрные клёши', rarity: 'rare', price: 1400, ...C('jeans2'),
    description: 'Расклешённые штаны с блеском потёртой кожи.', bonus: { type: 'popularity_pct', value: 7 } },
  { id: 7, slot: 'shoe', name: 'Красные кроссовки', rarity: 'common', price: 600, ...C('sneakers1'),
    description: 'Массивные красные кроссовки.', bonus: { type: 'popularity_pct', value: 7 } },
  { id: 8, slot: 'shoe', name: 'Тяжёлые ботинки', rarity: 'rare', price: 1600, ...C('boots1'),
    description: 'Чёрные ботинки с пряжками и заклёпками.', bonus: { type: 'income_pct', value: 5 } },
  { id: 9, slot: 'chain', name: 'Клетчатый шарф', rarity: 'epic', price: null, ...C('scarf1'),
    description: 'Шарф с бахромой. Выпадает только из паков.', bonus: { type: 'income_pct', value: 8 } },
]

export const PACKS = [{ id: 1, name: 'Базовый пак', price: 200, clothing_chance: 0.07 }]

// Стартовая колода игрока (id карточек). Остальные карточки добываются в паках.
export const START_CARD_IDS = [
  140, 101, 102, 104, 105, 141, 111, 112, 113, 115, 143, 121, 122, 124, 125, 131, 132, 133, 134,
]
