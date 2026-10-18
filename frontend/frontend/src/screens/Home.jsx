import Icon from '../components/Icon'
import { useGame } from '../GameContext'

export const APPS = [
  { id: 'soundwave', label: 'SoundWave', icon: 'cloud', bg: '#000', fg: 'var(--accent)', ring: true },
  { id: 'studio', label: 'Студия', icon: 'mic', bg: '#AF52DE', fg: '#fff' },
  { id: 'deck', label: 'Колода', icon: 'cards', bg: '#FF9F0A', fg: '#000' },
  { id: 'tg', label: 'ТГ', icon: 'plane', bg: '#0A84FF', fg: '#fff' },
  { id: 'profile', label: 'Профиль', icon: 'person', bg: '#30D158', fg: '#000' },
  { id: 'store', label: 'Магазин', icon: 'cart', bg: '#FF375F', fg: '#fff' },
]

export function AppIcon({ app, onOpen, size = 60, showLabel = true, badge }) {
  return (
    <button className="appicon" onClick={() => onOpen(app.id)} aria-label={app.label}>
      <span
        className="appicon-sq"
        style={{
          width: size,
          height: size,
          background: app.bg,
          color: app.fg,
          borderColor: app.ring ? '#2a2a2a' : 'transparent',
        }}
      >
        <Icon name={app.icon} size={size * 0.5} />
        {badge > 0 && <b className="badge">{badge}</b>}
      </span>
      {showLabel && <span className="appicon-label">{app.label}</span>}
    </button>
  )
}

export default function Home({ onOpen, unread }) {
  const { nick } = useGame()
  return (
    <div className="home">
      <div className="home-hello">Привет, {nick}</div>
      <div className="grid">
        {APPS.map((a) => (
          <AppIcon key={a.id} app={a} onOpen={onOpen} badge={a.id === 'tg' ? unread : 0} />
        ))}
      </div>
    </div>
  )
}
