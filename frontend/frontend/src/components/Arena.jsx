import { LAYER_ORDER } from '../constants'

// Верхняя половина батла: размытая толпа с фонариками и две фигурки рэперов на сцене.
// Фигурка = плоское тело + слои одежды (те же PNG 512x1024, что и в гардеробе).
// look: { hat: '/clothes/cap1.png', hoodie: ..., pants: ..., shoe: ..., chain: ... } (пустой слот = нет вещи)

// Базовое тело в тех же координатах 512x1024, что и слои одежды. Без одежды рэпер в простой футболке и шортах.
function Body({ skin, tee }) {
  const shade = '#00000033'
  return (
    <svg className="fig-body" viewBox="0 0 512 1024" shapeRendering="crispEdges" aria-hidden="true">
      {/* ноги и обувь */}
      <rect x="168" y="728" width="80" height="230" fill={skin} />
      <rect x="264" y="728" width="80" height="230" fill={skin} />
      <rect x="152" y="950" width="104" height="50" fill="#3a3a3a" />
      <rect x="256" y="950" width="104" height="50" fill="#3a3a3a" />
      {/* шорты */}
      <rect x="156" y="632" width="200" height="104" fill="#242424" />
      {/* руки */}
      <rect x="100" y="354" width="48" height="260" fill={skin} />
      <rect x="364" y="354" width="48" height="260" fill={skin} />
      <rect x="96" y="264" width="56" height="96" fill={tee} />
      <rect x="360" y="264" width="56" height="96" fill={tee} />
      <rect x="96" y="610" width="56" height="52" fill={skin} />
      <rect x="360" y="610" width="56" height="52" fill={skin} />
      {/* торс */}
      <rect x="148" y="256" width="216" height="384" fill={tee} />
      <rect x="148" y="256" width="216" height="16" fill={shade} />
      {/* шея и голова */}
      <rect x="224" y="226" width="64" height="40" fill={skin} />
      <rect x="224" y="226" width="64" height="12" fill={shade} />
      <rect x="160" y="72" width="192" height="144" fill={skin} />
      <rect x="176" y="56" width="160" height="176" fill={skin} />
      <rect x="192" y="48" width="128" height="8" fill={skin} />
      {/* лицо */}
      <rect x="208" y="136" width="24" height="32" fill="#000" />
      <rect x="280" y="136" width="24" height="32" fill="#000" />
      <rect x="232" y="192" width="48" height="8" fill="#00000066" />
    </svg>
  )
}

function Fighter({ name, look = {}, skin, tee, state, mine }) {
  return (
    <div className={`fighter ${state || ''}`}>
      <div className={'fighter-name' + (mine ? ' mine' : '')}>{name}</div>
      <div className="fig">
        <Body skin={skin} tee={tee} />
        {LAYER_ORDER.map((slot) =>
          look[slot] ? (
            <img
              key={slot}
              className="fig-layer"
              src={look[slot]}
              alt=""
              draggable="false"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : null,
        )}
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
