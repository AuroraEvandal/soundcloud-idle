import Icon from './Icon'

// Общая навигация: назад и крупный заголовок в отдельной строке.
export default function AppBar({ title, onBack, right, bg = 'var(--bg)', children }) {
  return (
    <header className="appbar" style={{ background: bg }}>
      <button className="appbar-btn" onClick={onBack} aria-label="Назад">
        <Icon name="back" />
        <span>Назад</span>
      </button>
      <h1 className="appbar-title">{children || title}</h1>
      <div className="appbar-right">{right}</div>
    </header>
  )
}
