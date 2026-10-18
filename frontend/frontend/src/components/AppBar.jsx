import Icon from './Icon'

// Верхняя навигация приложения: стрелка назад слева, заголовок по центру.
export default function AppBar({ title, onBack, right, bg = 'var(--bg)', children }) {
  return (
    <header className="appbar" style={{ background: bg }}>
      <button className="appbar-btn" onClick={onBack} aria-label="Назад">
        <Icon name="back" />
      </button>
      <div className="appbar-title">{children || title}</div>
      <div className="appbar-right">{right}</div>
    </header>
  )
}
