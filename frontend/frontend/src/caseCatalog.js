// Концепты витрины, не серверные ID предметов и не каталог для оплаты.
export const CASES = [
  {
    id: 'underground', name: 'UNDERGROUND', subtitle: 'Легенды не появляются из ниоткуда.', price: 29,
    image: '/cases/underground.png', accent: '#d4ff3f', label: 'ЛЕГЕНДАРНЫЙ ДРОП',
    description: 'Строчки, шмот и железо для твоего следующего выхода.',
    rewards: [
      { id: 'line', name: 'Последнее слово', kind: 'Легендарная строчка', icon: 'cards', chance: 60, detail: '«Ты искал своё место — я построил этаж». Концепт панча.' },
      { id: 'clothing', name: 'Худи «После полуночи»', kind: 'Легендарная одежда', icon: 'hoodie', chance: 25, detail: 'Чёрный оверсайз с кислотной вышивкой. Концепт косметики.' },
      { id: 'equipment', name: 'Микрофон «Золотой тейк»', kind: 'Легендарное оборудование', icon: 'mic', chance: 15, detail: 'Коллекционный студийный микрофон. Бонус ещё не назначен.' },
    ],
  },
  {
    id: 'gift-vault', name: 'GIFT VAULT', subtitle: 'Коллекция за пределами сцены.', price: 100,
    image: '/cases/gift-vault.png', accent: '#88dfff', label: 'TELEGRAM GIFTS',
    description: 'Основа кейса с коллекционными Telegram-подарками.',
    rewards: [
      { id: 'mascot', name: 'Неоновый талисман', kind: 'Концепт подарка', icon: 'person', detail: 'Идея для витрины. Не является реальным Telegram NFT.' },
      { id: 'heart', name: 'Хрустальное сердце', kind: 'Концепт подарка', icon: 'heart', detail: 'Идея для витрины. Каталог и запас подарков ещё не подключены.' },
      { id: 'crown', name: 'Корона сцены', kind: 'Концепт подарка', icon: 'crown', detail: 'Идея для витрины. Передача в Telegram пока недоступна.' },
    ],
  },
]
