import { useGame } from '../GameContext'
import './PetCompanion.css'

export function PetArt({ pet, pose = 'idle' }) {
  return <img className="pet-art" src={`/pets/${pet.id}/${pose}.png`} alt={pet.name} draggable="false" />
}

export default function PetCompanion({ pose = 'idle', compact = false }) {
  const { activePet } = useGame()
  if (!activePet) return null
  return <div className={'pet-companion' + (compact ? ' compact' : '')}>
    <PetArt pet={activePet} pose={pose} />
    {!compact && <span><b>{activePet.name}</b><small>Ур. {activePet.level} · дружба {activePet.friendship_stage}/3 · доход +{activePet.income_pct}%</small></span>}
  </div>
}
