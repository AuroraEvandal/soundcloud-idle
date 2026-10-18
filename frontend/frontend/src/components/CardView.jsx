import { RARITY } from '../constants'

// Карточка из руки. Текст и свойства приходят с сервера, мы ничего не придумываем.
export default function CardView({ card, selected, onClick, compact }) {
  const bonus = card.bonus?.type === 'flat_points' ? `+${card.bonus.value} очков` : null
  return (
    <button
      type="button"
      className={`card rarity-${card.rarity}` + (selected ? ' selected' : '') + (compact ? ' compact' : '')}
      onClick={onClick}
      aria-pressed={!!selected}
    >
      <span className="card-text">{card.text}</span>
      <span className="card-meta">
        <span className="card-rarity">{RARITY[card.rarity] || card.rarity}</span>
        <span>{card.theme}</span>
        {bonus && <span className="card-bonus">{bonus}</span>}
      </span>
    </button>
  )
}
