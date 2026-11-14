// У игрока портрет фрешмена, у контактов — первая буква имени.
export default function Avatar({ name = '?', color = 'var(--accent)', size = 44, player = false }) {
  return (
    <div
      className={'avatar' + (player ? ' player-avatar' : '')}
      role="img"
      aria-label={name}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {player ? <img src="/player/freshman.png" alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
