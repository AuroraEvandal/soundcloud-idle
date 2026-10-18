import { useGame } from '../GameContext'
import AppBar from '../components/AppBar'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import { SKILLS } from '../constants'

export default function Profile({ onClose }) {
  const { nick, player, profile, logout } = useGame()
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
          <Avatar name={nick} color="var(--card)" size={96} />
          <div className="profile-name">{nick}</div>
          <div className="career">
            {location.toUpperCase()} (УР. {player.level})
          </div>
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
          <div className="row-between mt">
            <span>Оценок судьи осталось</span>
            <span className="muted">{player.ai_requests_left}</span>
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
                <span>{b.opponent_name}</span>
                <span className={b.result === 'win' ? 'win' : 'loss'}>{b.result === 'win' ? 'Победа' : 'Поражение'}</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn dark wide" onClick={logout}>
          СМЕНИТЬ НИК
        </button>
      </div>
    </div>
  )
}
