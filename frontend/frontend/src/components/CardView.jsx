import { RARITY } from '../constants'

// Осталось боёв до сгорания: 3 боя / 2 боя / 1 бой / сгорела
const usesLabel = (n) => (n <= 0 ? 'сгорела' : `${n} ${n === 1 ? 'бой' : 'боя'}`)

// Карточка из руки. Текст и свойства приходят с сервера, мы ничего не придумываем.
export default function CardView({ card, selected, onClick, compact }) {
  const bonus = card.bonus?.type === 'flat_points' ? `+${card.bonus.value} очков` : null
  const burned = card.uses_left != null && card.uses_left <= 0
  return (
    <button
      type="button"
      className={`card rarity-${card.rarity}` + (burned ? ' burned' : '') + (selected ? ' selected' : '') + (compact ? ' compact' : '')}
      onClick={onClick}
      aria-pressed={!!selected}
    >
      <span className="card-text">{card.text}</span>
      <span className="card-meta">
        <span className="card-rarity">{RARITY[card.rarity] || card.rarity}</span>
        <span>{card.theme}</span>
        {bonus && <span className="card-bonus">{bonus}</span>}
        {card.uses_left != null && <span className="card-uses">{usesLabel(card.uses_left)}</span>}
      </span>
    </button>
  )
}
