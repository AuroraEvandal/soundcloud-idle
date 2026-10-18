// Подписи бонусов для интерфейса. Значения приходят с сервера.
export function bonusText(b) {
  if (!b) return ''
  if (b.type === 'income_pct') return `+${b.value}% к доходу`
  if (b.type === 'popularity_pct') return `+${b.value}% к росту популярности`
  if (b.type === 'charisma') return `+${b.value} к харизме`
  return ''
}
