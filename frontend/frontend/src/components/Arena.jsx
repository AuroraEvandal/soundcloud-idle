import CharacterModel from './CharacterModel'

// Верхняя половина батла: размытая толпа с фонариками и две фигурки рэперов на сцене.
// Фигурка = плоское тело + слои одежды (те же PNG 512x1024, что и в гардеробе).
// look: { hat: '/clothes/cap1.png', hoodie: ..., pants: ..., shoe: ..., chain: ... } (пустой слот = нет вещи)

function Fighter({ name, look = {}, skin, tee, state, mine }) {
  return (
    <div className={`fighter ${state || ''}`}>
      <div className={'fighter-name' + (mine ? ' mine' : '')}>{name}</div>
      <div className="fig">
        <CharacterModel look={look} skin={skin} tee={tee} />
      </div>
    </div>
  )
}

// Силуэты толпы строятся детерминированно, чтобы не перерисовываться случайно.
const CROWD = Array.from({ length: 22 }, (_, i) => ({
  x: 8 + i * 16 + ((i * 37) % 7),
  y: 18 + ((i * 53) % 24),
  r: 9 + ((i * 11) % 4),
}))
const LIGHTS = CROWD.filter((_, i) => i % 3 !== 1).map((c, i) => ({
  x: c.x - 9 + ((i * 5) % 12),
  y: c.y - 18 - ((i * 7) % 9),
  d: (i * 0.37) % 2,
}))

export default function Arena({ playerName, opponentName, playerLook, opponentLook, playerState, opponentState, shake }) {
  return (
    <div className={'arena' + (shake ? ' shake' : '')}>
      <svg className="crowd" viewBox="0 0 360 100" preserveAspectRatio="none" aria-hidden="true">
        {CROWD.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={c.r} fill="#000" />
            <rect x={c.x - c.r - 4} y={c.y + c.r - 2} width={(c.r + 4) * 2} height="60" fill="#000" />
          </g>
        ))}
      </svg>
      <svg className="lights" viewBox="0 0 360 100" preserveAspectRatio="none" aria-hidden="true">
        {LIGHTS.map((l, i) => (
          <rect key={i} className="light" x={l.x} y={l.y} width="3" height="3" fill="#fff" style={{ animationDelay: `${l.d}s` }} />
        ))}
      </svg>
      <div className="stage-floor" />
      <div className="fighters">
        <Fighter name={playerName} look={playerLook} skin="#d9a37a" tee="#ff5500" state={playerState} mine />
        <Fighter name={opponentName || '???'} look={opponentLook} skin="#c98f68" tee="#6a6a6a" state={opponentState} />
      </div>
    </div>
  )
}
