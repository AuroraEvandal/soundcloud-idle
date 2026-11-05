import { LAYER_ORDER } from '../constants'

// Сохраняем PNG одежды 512×1024, подгонка к пропорциям фрешмена — в CSS.
export default function CharacterModel({ look = {} }) {
  return (
    <>
      <img className="fig-body player-body" src="/player/freshman.png" alt="" draggable="false" />
      {LAYER_ORDER.map((slot) => look[slot] ? (
        <img key={look[slot]} className={`fig-layer player-layer-${slot}`} src={look[slot]} alt="" draggable="false"
          onError={(event) => { event.currentTarget.style.display = 'none' }} />
      ) : null)}
    </>
  )
}
