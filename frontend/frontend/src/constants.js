// Слоты строго в порядке из docs/api.md: cardIds отправляются в этом порядке.
export const SLOTS = [
  ['setup', 'Завязка'],
  ['development', 'Развитие'],
  ['boost', 'Усиление'],
  ['punch', 'Панч'],
]

export const CRITERIA = [
  ['rhyme', 'Рифма'],
  ['flow', 'Флоу'],
  ['punch', 'Панч'],
  ['meaning', 'Смысл'],
]

export const SKILLS = [
  ['rhyme', 'Рифма'],
  ['flow', 'Флоу'],
  ['punch', 'Панч'],
  ['charisma', 'Харизма'],
]

export const RARITY = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
}

// Порядок слоёв одежды на фигуре снизу вверх (одинаков в гардеробе и в арене батла)
export const LAYER_ORDER = ['pants', 'shoe', 'hoodie', 'chain', 'hat']
