import { useEffect, useState } from 'react'

const hhmm = () => {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// iOS-подобный статус-бар: время, Dynamic Island с уведомлениями, сеть/Wi-Fi/батарея.
export default function StatusBar({ island }) {
  const [time, setTime] = useState(hhmm())
  useEffect(() => {
    const t = setInterval(() => setTime(hhmm()), 15000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="statusbar">
      <div className="sb-time">{time}</div>
      <div className={'island' + (island ? ' open' : '')} aria-live="polite">
        {island && <span className="island-text">{island}</span>}
      </div>
      <div className="sb-right" aria-hidden="true">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#fff">
          <rect x="0" y="8" width="3" height="4" />
          <rect x="5" y="5" width="3" height="7" />
          <rect x="10" y="2" width="3" height="10" />
          <rect x="15" y="0" width="3" height="12" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M1 4.5a10 10 0 0 1 14 0M3.5 7.5a6.5 6.5 0 0 1 9 0" />
          <rect x="7" y="9.5" width="2" height="2" fill="#fff" stroke="none" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" stroke="#fff" opacity=".5" />
          <rect x="2" y="2" width="19" height="8" fill="#fff" />
          <rect x="23.5" y="4" width="2" height="4" fill="#fff" opacity=".5" />
        </svg>
      </div>
    </div>
  )
}
