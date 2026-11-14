// Набор плоских оранжевых полос. Высоты фиксированы по зерну, чтобы не мигали.
export default function Waveform({ seed = 1, progress = 0.5, bars = 38 }) {
  const items = []
  let s = seed * 9301 + 49297
  for (let i = 0; i < bars; i++) {
    s = (s * 9301 + 49297) % 233280
    const h = 18 + Math.round((s / 233280) * 82)
    items.push(
      <span
        key={i}
        className="wf-bar"
        style={{ height: `${h}%`, opacity: i / bars <= progress ? 1 : 0.35 }}
      />,
    )
  }
  return <div className="waveform">{items}</div>
}
