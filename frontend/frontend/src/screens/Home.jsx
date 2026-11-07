import Icon from '../components/Icon'
import { useGame } from '../GameContext'
import ResourceBar from '../components/ResourceBar'

export const APPS = [
  { id: 'soundwave', label: 'SoundWave', icon: 'cloud', accent: true },
  { id: 'studio', label: 'Студия', icon: 'mic' },
  { id: 'deck', label: 'Колода', icon: 'cards', accent: true },
  { id: 'tg', label: 'ТГ', icon: 'plane', accent: true },
  { id: 'profile', label: 'Профиль', icon: 'person' },
  { id: 'store', label: 'Магазин', icon: 'cart', accent: true },
  { id: 'casino', label: 'Казик', icon: 'gift' },
  { id: 'concert', label: 'Концерт · демо', icon: 'headphones', accent: true },
]

export function AppIcon({ app, onOpen, size = 64, showLabel = true, badge }) {
  return (
    <button className="appicon" onClick={() => onOpen(app.id)} aria-label={app.label}>
      <span
        className={'appicon-sq' + (app.accent ? ' accent' : '')}
        style={{
          width: size,
          height: size,
        }}
      >
        <Icon name={app.icon} size={size * 0.56} stroke={1.9} />
        {badge > 0 && <b className="badge">{badge}</b>}
      </span>
      {showLabel && <span className="appicon-label">{app.label}</span>}
    </button>
  )
}

export default function Home({ onOpen, unread }) {
  const { nick } = useGame()
  return (
    <div className="home scroll">
      <div className="home-hello"><h1>Привет, {nick}</h1><p>Твоя сцена начинается здесь</p></div>
      <ResourceBar expanded />
      <div className="grid">
        {APPS.map((a) => (
          <AppIcon key={a.id} app={a} onOpen={onOpen} badge={a.id === 'tg' ? unread : 0} />
        ))}
      </div>
      <div className="home-wallpaper" aria-hidden="true">{[20, 30, 44, 62, 78, 100, 84, 56, 36].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>
    </div>
  )
}
