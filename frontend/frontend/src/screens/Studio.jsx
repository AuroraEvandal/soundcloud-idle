import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { getStudio, recordSnippet, selectBeat, buyItem } from '../api'
import { errorInfo } from '../errors'
import { bonusText } from '../bonus'
import AppBar from '../components/AppBar'
import Tabs from '../components/Tabs'
import Icon from '../components/Icon'
import ProgressBar from '../components/ProgressBar'
import ErrorBox from '../components/ErrorBox'

const ICONS = { 1: 'headphones', 2: 'mic', 3: 'box', 4: 'headphones' }

export default function Studio({ onClose }) {
  const { player, setPlayer, notify } = useGame()
  const [tab, setTab] = useState('rec')
  const [studio, setStudio] = useState(null)
  const [error, setError] = useState(null)
  const [tap, setTap] = useState(false)
  const [releases, setReleases] = useState([])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const pending = useRef(0)
  const inflight = useRef(false)
  const timer = useRef(null)

  const load = useCallback(() => {
    getStudio()
      .then((r) => {
        setStudio(r.studio)
        setPlayer(r.player)
      })
      .catch((e) => setError(errorInfo(e)))
  }, [setPlayer])

  useEffect(() => {
    load()
  }, [load])

  // Тапы копятся и отправляются пачкой. Считает сервер, здесь только быстрый отклик.
  const flush = useCallback(async () => {
    if (inflight.current || !pending.current) return
    const taps = pending.current
    pending.current = 0
    inflight.current = true
    try {
      const r = await recordSnippet(taps)
      setStudio(r.studio)
      setPlayer(r.player)
      const released = r.released || []
      if (released.length) {
        setReleases((current) => [...current, ...released])
        released.forEach((s) => notify(`Сниппет вышел: +${s.streams} прослушиваний, +₽${s.coins}`))
      }
      setError(null)
    } catch (e) {
      setError(errorInfo(e))
      load()
    } finally {
      inflight.current = false
      if (pending.current) flush()
    }
  }, [load, notify, setPlayer])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      // Не теряем тапы, если игрок уходит со страницы раньше debounce-таймера.
      if (pending.current) flush()
    },
    [flush],
  )

  function onTap() {
    if (!studio || studio.energy <= 0) {
      setError(errorInfo({ code: 'NO_ENERGY' }))
      return
    }
    setError(null)
    setStudio((s) => ({ ...s, energy: s.energy - 1, hype: (s.hype + 1) % s.hype_max }))
    pending.current += 1
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }

  async function act(fn) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorInfo(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const pick = (id) =>
    act(async () => {
      const r = await selectBeat(id)
      setStudio(r.studio)
    })

  const buy = (id) =>
    act(async () => {
      const r = await buyItem('equipment', id)
      setPlayer(r.player)
      load()
    })

  return (
    <div className="app">
      <AppBar title="Студия" onBack={onClose} />
      <Tabs
        tabs={[
          ['rec', 'Запись'],
          ['beats', 'Биты'],
          ['gear', 'Оборудование'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="app-body scroll">
        <div className="pad">
          <ErrorBox message={error?.message} onRetry={error?.action === 'retry' ? load : null} onHome={() => setError(null)} />
        </div>
        {!studio && !error && <div className="center-fill muted">Загрузка…</div>}
        {studio && tab === 'rec' && (
          <div className="studio-rec">
            <div className="studio-title">ЗАПИСЬ СНИППЕТА</div>
            <button
              className={'mic' + (tap ? ' tap' : '')}
              onPointerDown={() => {
                setTap(true)
                onTap()
              }}
              onPointerUp={() => setTap(false)}
              onPointerLeave={() => setTap(false)}
              aria-label="Микрофон: тапай, чтобы набрать хайп"
            >
              <Icon name="mic" size={96} color="#fff" stroke={1.6} />
            </button>
            <div className="studio-sub">ТАПАЙ ЧТОБЫ НАБРАТЬ ХАЙП</div>
            <div className="meter">
              <div className="row-between small-t">
                <span>Хайп</span>
                <span className="muted">
                  {studio.hype} / {studio.hype_max}
                </span>
              </div>
              <ProgressBar value={studio.hype} max={studio.hype_max} />
              <div className="row-between small-t mt">
                <span>Энергия</span>
                <span className="muted">
                  {studio.energy} / {studio.energy_max}
                </span>
              </div>
              <ProgressBar value={studio.energy} max={studio.energy_max} color="#fff" />
            </div>
            <div className="muted small-t">
              Доход от сниппетов: +{studio.income_pct}% · Популярность {player?.popularity}
            </div>
          </div>
        )}
        {studio && tab === 'beats' && (
          <div className="pad list">
            {studio.beats.map((b) => (
              <div className="row" key={b.id}>
                <div className="row-main">{b.name}</div>
                <button className="btn small" disabled={busy || b.id === studio.selected_beat_id} onClick={() => pick(b.id)}>
                  {b.id === studio.selected_beat_id ? 'ВЫБРАН' : 'ВЫБРАТЬ'}
                </button>
              </div>
            ))}
          </div>
        )}
        {studio && tab === 'gear' && (
          <div className="pad list">
            {studio.equipment.map((e) => (
              <div className="row bar" key={e.id}>
                <Icon name={ICONS[e.id] || 'box'} size={28} />
                <div className="row-main">
                  {e.name}
                  <div className="muted small-t">{bonusText(e.bonus)}</div>
                </div>
                {e.owned ? (
                  <span className="muted small-t">КУПЛЕНО</span>
                ) : (
                  <>
                    <span className="price">₽{e.price}</span>
                    <button className="btn small" disabled={busy || (player?.coins ?? 0) < e.price} onClick={() => buy(e.id)}>
                      КУПИТЬ
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {releases.length > 0 && (
        <div className="release-shade">
          <section className="release-card" role="dialog" aria-modal="true" aria-labelledby="release-title">
            <div className="release-art" aria-hidden="true">
              <div className="release-disc"><span /></div>
              <div className="release-wave"><i /><i /><i /><i /><i /><i /><i /></div>
              <Icon name="cloud" size={30} color="var(--accent)" />
            </div>
            <div className="release-kicker">НОВЫЙ РЕЛИЗ</div>
            <h2 id="release-title">Сниппет вышел!</h2>
            <p className="muted release-copy">Трек уже слушают. Продолжай записывать — следующая запись не за горами.</p>
            <div className="release-stats" aria-live="polite">
              <div><b>+{releases[0].streams}</b><span>прослушиваний</span></div>
              <div><b>+{releases[0].coins}</b><span>монет</span></div>
              <div><b>+{releases[0].popularity_change}</b><span>популярности</span></div>
            </div>
            <button className="btn release-cta" onClick={() => setReleases((queue) => queue.slice(1))}>
              ОТЛИЧНО
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
