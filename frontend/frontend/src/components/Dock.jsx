import { AppIcon, APPS } from '../screens/Home'

const DOCK = ['soundwave', 'tg', 'profile', 'store']

export default function Dock({ onOpen, unread }) {
  return (
    <nav className="dock" aria-label="Док">
      {DOCK.map((id) => {
        const app = APPS.find((a) => a.id === id)
        return <AppIcon key={id} app={app} onOpen={onOpen} size={54} showLabel={false} badge={id === 'tg' ? unread : 0} />
      })}
    </nav>
  )
}
