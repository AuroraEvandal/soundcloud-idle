export default function ProgressBar({ value, max, color = 'var(--accent)', height = 6 }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="pbar" style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="pbar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
