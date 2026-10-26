import { LAYER_ORDER } from '../constants'

// Единый базовый персонаж для гардероба и арены. Слои одежды остаются
// исходными PNG 512x1024 и накладываются в тех же координатах.
function Body({ skin = '#d9a37a', tee = '#ff5500' }) {
  const shade = '#00000033'
  return (
    <svg className="fig-body" viewBox="0 0 512 1024" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="168" y="728" width="80" height="230" fill={skin} />
      <rect x="264" y="728" width="80" height="230" fill={skin} />
      <rect x="152" y="950" width="104" height="50" fill="#3a3a3a" />
      <rect x="256" y="950" width="104" height="50" fill="#3a3a3a" />
      <rect x="156" y="632" width="200" height="104" fill="#242424" />
      <rect x="100" y="354" width="48" height="260" fill={skin} />
      <rect x="364" y="354" width="48" height="260" fill={skin} />
      <rect x="96" y="264" width="56" height="96" fill={tee} />
      <rect x="360" y="264" width="56" height="96" fill={tee} />
      <rect x="96" y="610" width="56" height="52" fill={skin} />
      <rect x="360" y="610" width="56" height="52" fill={skin} />
      <rect x="148" y="256" width="216" height="384" fill={tee} />
      <rect x="148" y="256" width="216" height="16" fill={shade} />
      <rect x="224" y="226" width="64" height="40" fill={skin} />
      <rect x="224" y="226" width="64" height="12" fill={shade} />
      <rect x="160" y="72" width="192" height="144" fill={skin} />
      <rect x="176" y="56" width="160" height="176" fill={skin} />
      <rect x="192" y="48" width="128" height="8" fill={skin} />
      <rect x="208" y="136" width="24" height="32" fill="#000" />
      <rect x="280" y="136" width="24" height="32" fill="#000" />
      <rect x="232" y="192" width="48" height="8" fill="#00000066" />
    </svg>
  )
}

export default function CharacterModel({ look = {}, skin, tee }) {
  return (
    <>
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
    </>
  )
}
