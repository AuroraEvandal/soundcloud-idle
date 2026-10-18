import { useGame } from '../GameContext'
import Waveform from '../components/Waveform'
import ProgressBar from '../components/ProgressBar'

const COVERS = ['#FF5500', '#0A84FF', '#30D158', '#AF52DE', '#FF9F0A']

// Лента треков строится из последних батлов (recent_battles из get-profile).
export default function Feed() {
  const { nick, profile } = useGame()
  const items = profile?.recent_battles || []
  if (!items.length) {
    return (
      <div className="pad">
        <div className="empty">
          Лента пока пустая. Сыграй первый батл, и трек появится здесь
        </div>
      </div>
    )
  }
  return (
    <div className="pad scroll">
      <div className="list">
        {items.map((b, i) => (
          <div className="track" key={b.id}>
            <div className="cover" style={{ background: COVERS[i % COVERS.length] }}>
              {b.result === 'win' ? 'W' : 'L'}
            </div>
            <div className="track-main">
              <div className="track-title">Баттл vs {b.opponent_name}</div>
              <div className="muted small-t">
                {nick} · {b.result === 'win' ? 'победа' : 'поражение'}
              </div>
              <Waveform seed={i + b.opponent_name.length} progress={b.result === 'win' ? 1 : 0.45} />
              <ProgressBar value={b.result === 'win' ? 100 : 45} max={100} height={3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
