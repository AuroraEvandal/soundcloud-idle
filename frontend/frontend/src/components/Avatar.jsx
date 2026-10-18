// Плоский круг с первой буквой ника. Без градиентов.
export default function Avatar({ name = '?', color = 'var(--accent)', size = 44 }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
