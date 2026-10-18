// Верхняя половина батла: размытая толпа с фонариками и две pixel-art фигурки на сцене.
const SPRITE = [
  '....HHHH....',
  '...HHHHHH...',
  '...SSSSSS...',
  '...SKSSKS...',
  '...SSSSSS...',
  '....SSSS....',
  '..BBBBBBBB..',
  '.SBBBBBBBBS.',
  '.SBBBBBBBBS.',
  '..BBBBBBBB..',
  '...PPPPPP...',
  '...PPPPPP...',
  '...PP..PP...',
  '...PP..PP...',
  '..WWW..WWW..',
  '..WWW..WWW..',
]

const PLAYER = { H: '#FF5500', S: '#d9a37a', K: '#000', B: '#FFFFFF', P: '#4a4a4a', W: '#FF5500' }
const ENEMY = { H: '#A0A0A0', S: '#c98f68', K: '#000', B: '#6a6a6a', P: '#3a3a3a', W: '#A0A0A0' }

function Sprite({ colors, flip, state, name }) {
  const rects = []
  SPRITE.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '.') rects.push(<rect key={x + '-' + y} x={x} y={y} width="1" height="1" fill={colors[c]} />)
    }),
  )
  return (
    <div className={`fighter ${state || ''}`}>
      <div className="fighter-name">{name}</div>
      <svg
        className="sprite"
        viewBox="0 0 12 16"
        shapeRendering="crispEdges"
        style={{ transform: flip ? 'scaleX(-1)' : undefined }}
        aria-hidden="true"
      >
        {rects}
      </svg>
    </div>
  )
}

// Силуэты толпы строятся детерминированно, чтобы не перерисовываться случайно.
const CROWD = Array.from({ length: 22 }, (_, i) => ({
  x: 8 + i * 16 + ((i * 37) % 7),
  y: 18 + ((i * 53) % 24),
  r: 9 + ((i * 11) % 4),
}))
const LIGHTS = CROWD.filter((_, i) => i % 3 !== 1).map((c, i) => ({ x: c.x - 9 + ((i * 5) % 12), y: c.y - 18 - ((i * 7) % 9), d: (i * 0.37) % 2 }))

export default function Arena({ playerName, opponentName, playerState, opponentState, shake }) {
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
        <Sprite colors={PLAYER} state={playerState} name={playerName} />
        <Sprite colors={ENEMY} flip state={opponentState} name={opponentName || '???'} />
      </div>
    </div>
  )
}
