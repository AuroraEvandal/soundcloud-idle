import { useGame } from '../GameContext'

// Плоская панель ресурсов. Все значения берём из player (docs/api.md).
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n))

export default function ResourceBar() {
  const { player } = useGame()
  if (!player) return null
  const fmt = (n) => Number(n).toLocaleString('ru-RU')
  return (
    <div className="resbar" aria-label="Ресурсы">
      <span>₽{fmt(player.coins)}</span>
      <i />
      <span>Ур. {player.level}</span>
      <i />
      <span>{short(player.streams || 0)} Strms</span>
      <i />
      <span>{fmt(player.popularity)} Fans</span>
      <i />
      <span>⚡{player.ai_requests_left}</span>
    </div>
  )
}
