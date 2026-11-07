import { useGame } from '../GameContext'

// Плоская панель ресурсов. Все значения берём из player (docs/api.md).
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n))

export default function ResourceBar({ expanded = false }) {
  const { player } = useGame()
  if (!player) return null
  const fmt = (n) => Number(n).toLocaleString('ru-RU')
  if (expanded) return (
    <section className="home-resources" aria-label="Ресурсы">
      <div className="row-between"><strong>{fmt(player.coins)} ₽</strong><span className="level-pill">Уровень {player.level}</span></div>
      <div className="home-resource-detail"><span><b>{short(player.streams || 0)}</b> прослушиваний</span><span><b>{fmt(player.popularity)}</b> фанатов</span></div>
    </section>
  )
  return (
    <div className="resbar" aria-label="Ресурсы">
      <span>₽{fmt(player.coins)}</span>
      <i />
      <span>Ур. {player.level}</span>
      <i />
      <span>{short(player.streams || 0)} Strms</span>
      <i />
      <span>{fmt(player.popularity)} Fans</span>
    </div>
  )
}
