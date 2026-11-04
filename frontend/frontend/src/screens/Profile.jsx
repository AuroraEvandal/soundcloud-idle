import { useState } from 'react'
import { useGame } from '../GameContext'
import { equipPet } from '../api'
import { errorInfo } from '../errors'
import ErrorBox from '../components/ErrorBox'
import { PetArt } from '../components/PetCompanion'
import AppBar from '../components/AppBar'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import { SKILLS } from '../constants'
import { isBossUnlocked, opponentDisplayName } from '../displayNames'

export default function Profile({ onClose, onReplayIntro }) {
  const { nick, player, profile, petCollection, setPetCollection, petsError, refreshPets } = useGame()
  const [petBusy, setPetBusy] = useState(false)
  const [petError, setPetError] = useState(null)
  async function choosePet(petId) {
    if (petBusy) return
    setPetBusy(true)
    setPetError(null)
    try { setPetCollection(await equipPet(petId)) }
    catch (e) { setPetError(errorInfo(e)) }
    finally { setPetBusy(false) }
  }
  if (!player) return null
  const unlocked = (profile?.opponents || []).filter((o) => o.unlocked)
  const location = unlocked.length ? unlocked[unlocked.length - 1].location : 'Двор'
  const max = Math.max(10, ...SKILLS.map(([k]) => player.skills[k]))
  const st = profile?.stats || { battles_played: 0, wins: 0, losses: 0 }

  return (
    <div className="app">
      <AppBar title="Профиль" onBack={onClose} />
      <div className="app-body scroll pad">
        <div className="profile-top">
          <Avatar name={nick} color="var(--card)" size={96} player />
          <div className="profile-name">{nick}</div>
          <div className="career">
            {location.toUpperCase()} (УР. {player.level})
          </div>
        </div>

        <button className="story-replay" onClick={onReplayIntro}>↺ Как всё начиналось <span>Повторить вступление</span></button>

        <div className="panel pet-collection">
          <h3>Твоя команда</h3>
          <p>Выбери одного спутника. Релизы и завершённые батлы укрепляют дружбу. Дубликаты из кейсов повышают уровень.</p>
          <ErrorBox message={(petError || petsError)?.message} onRetry={() => refreshPets().catch(() => {})} onHome={() => setPetError(null)} />
          {!petCollection && !petsError && <p>Загружаем питомцев…</p>}
          {petCollection?.pets.map((pet) => <div className={'pet-card' + (!pet.owned ? ' locked' : '')} key={pet.id}>
            <PetArt pet={pet} pose={pet.owned ? 'idle' : 'sleep'} />
            <div className="pet-details"><b>{pet.name}</b>
              {pet.owned ? <><small>Уровень {pet.level}/3 · доход +{pet.income_pct}%</small>
                <small>Дружба {pet.friendship}/60 · стадия {pet.friendship_stage}/3</small>
                <ProgressBar value={pet.friendship} max={60} />
                <button className="btn small" disabled={petBusy} onClick={() => choosePet(petCollection.active_pet_id === pet.id ? null : pet.id)}>
                  {petCollection.active_pet_id === pet.id ? 'ОТПУСТИТЬ ОТДОХНУТЬ' : 'ВЗЯТЬ С СОБОЙ'}
                </button>
                {petCollection.active_pet_id === pet.id && <div className="pet-active-label">СЕЙЧАС С ТОБОЙ</div>}
              </> : <small>Ещё не открыт · ищи в кейсах</small>}
            </div>
          </div>)}
          <p>Дружба: +1 за релиз, +3 за батл. Новые стадии при 20 и 60. Бонус действует на доход сниппетов.</p>
        </div>

        <div className="panel">
          <div className="row-between">
            <span>Опыт</span>
            <span className="muted">
              {player.xp} / {player.xp_to_next}
            </span>
          </div>
          <ProgressBar value={player.xp} max={player.xp_to_next} />
          <div className="row-between mt">
            <span>Популярность</span>
            <span className="muted">{player.popularity}</span>
          </div>
        </div>

        <div className="panel skills">
          {SKILLS.map(([k, label]) => (
            <div className="skill" key={k}>
              <div className="skill-track">
                <div className="skill-fill" style={{ height: `${(player.skills[k] / max) * 100}%` }} />
              </div>
              <div className="skill-val">{player.skills[k]}</div>
              <div className="skill-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="panel stats">
          <div>
            <b>{st.battles_played}</b>
            <span>батлов</span>
          </div>
          <div>
            <b>{st.wins}</b>
            <span>побед</span>
          </div>
          <div>
            <b>{st.losses}</b>
            <span>поражений</span>
          </div>
        </div>

        {!!profile?.recent_battles?.length && (
          <div className="panel">
            <div className="section">Последние батлы</div>
            {profile.recent_battles.map((b) => (
              <div className="row-between mt" key={b.id}>
                <span>{opponentDisplayName({ id: b.opponent_id, name: b.opponent_name }, isBossUnlocked(profile))}</span>
                <span className={b.result === 'win' ? 'win' : 'loss'}>{b.result === 'win' ? 'Победа' : 'Поражение'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
