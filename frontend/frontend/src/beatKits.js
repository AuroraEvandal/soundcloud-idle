export const BEAT_KITS = {
  trap: { name: 'Trap', roots: { piano: 12, melody: 24 }, piano: 'Тёмные FM-клавиши', melody: 'Yamaha TX81Z · FM-лид' },
  plugg: { name: 'Plugg', roots: { piano: 12, melody: 24 }, piano: 'Мягкие цифровые клавиши', melody: 'Звонкие колокольчики' },
  cloud_rap: { name: 'Cloud rap', roots: { piano: 12, melody: 14 }, piano: 'Приглушённые FM-клавиши', melody: 'Воздушный пэд · смычковый вибрафон' },
}
export const genreName = genre => BEAT_KITS[genre]?.name || ({ drill: 'Drill', phonk: 'Phonk' }[genre]) || genre
