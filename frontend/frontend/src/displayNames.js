// Названия для интерфейса. Каталоги и записи, полученные с сервера, не меняются.
const CLOTHING_NAMES = {
  3: 'Рик овёс худи',
  4: 'двигай пор вида',
  5: 'Ле бранд блю',
  6: 'клещи',
  7: 'Раф',
}

const CLOTHING_OLD_NAMES = {
  'Худи-маска': CLOTHING_NAMES[3],
  'Серое пальто': CLOTHING_NAMES[4],
  'Джинсы с черепами': CLOTHING_NAMES[5],
  'Чёрные клёши': CLOTHING_NAMES[6],
  'Красные кроссовки': CLOTHING_NAMES[7],
}

const OPPONENT_NAMES = {
  1: '3гот2010',
  2: 'арлекин40тыщ',
  3: 'пузо80',
  4: 'XVIIroyal',
}

const OPPONENT_OLD_NAMES = {
  'МС Подвал': OPPONENT_NAMES[1],
  'Лёха Бит': OPPONENT_NAMES[2],
  'Леха Бит': OPPONENT_NAMES[2],
  'Тихий Рейв': OPPONENT_NAMES[3],
  'DJ Кассета': OPPONENT_NAMES[4],
  'Босс Фестиваля': 'DOOM RUSHA',
}

export function clothingDisplayName(item) {
  return CLOTHING_NAMES[item?.id] || CLOTHING_OLD_NAMES[item?.name] || item?.name
}

export function opponentDisplayName(opponent, bossUnlocked = true) {
  if (opponent?.id === 5 || opponent?.name === 'Босс Фестиваля' || opponent?.name === 'DOOM RUSHA') {
    return bossUnlocked ? 'DOOM RUSHA' : '???'
  }
  return OPPONENT_NAMES[opponent?.id] || OPPONENT_OLD_NAMES[opponent?.name] || opponent?.name || '???'
}

export function isBossUnlocked(profile) {
  return Boolean(profile?.opponents?.find((opponent) => opponent.id === 5)?.unlocked)
}
