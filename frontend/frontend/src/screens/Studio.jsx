import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { getStudio, recordSnippet, selectBeat, buyBeat, buyItem } from '../api'
import { errorInfo } from '../errors'
import { bonusText } from '../bonus'
import AppBar from '../components/AppBar'
import Tabs from '../components/Tabs'
import Icon from '../components/Icon'
import ProgressBar from '../components/ProgressBar'
import ErrorBox from '../components/ErrorBox'
import PetCompanion from '../components/PetCompanion'
import { studioRecorderFor } from '../studioRecorder'
import Beatmaker from './Beatmaker'

const ICONS = { 1: 'headphones', 2: 'mic', 3: 'box', 4: 'headphones' }

export default function Studio({ onClose }) {
  const { player, setPlayer, refreshPets } = useGame()
  const [tab, setTab] = useState('rec')
  const [tap, setTap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const busyRef = useRef(false)
  const recorder = useMemo(() => studioRecorderFor(player.id, {
    send: recordSnippet,
    fetchStudio: getStudio,
    onResult: (r) => {
      setPlayer(r.player)
      if (r.released?.length) refreshPets().catch(() => {})
    },
  }), [player.id, setPlayer, refreshPets])
  const [recording, setRecording] = useState(recorder.snapshot)
  const { studio, releases, releasing } = recording
  const error = actionError || (recording.error ? errorInfo(recording.error) : null)
  const load = () => recorder.load()
  const setError = setActionError

  useEffect(() => recorder.subscribe(setRecording), [recorder])
  useEffect(() => { recorder.load() }, [recorder])
  useEffect(() => {
    const timer = setInterval(() => recorder.tick(), 3000)
    return () => clearInterval(timer)
  }, [recorder])

  function onTap() {
    if (!busyRef.current) recorder.tap()
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
      await selectBeat(id)
      await recorder.load()
    })

  const buyBeatItem = (id) =>
    act(async () => {
      const r = await buyBeat(id)
      setPlayer(r.player)
      await recorder.load()
    })

  const buy = (id) =>
    act(async () => {
      const r = await buyItem('equipment', id)
      setPlayer(r.player)
      load()
    })

  return (
    <div className="app studio-app">
      <AppBar title="Студия" onBack={onClose} />
      <Tabs
        tabs={[
          ['rec', 'Запись'],
          ['maker', 'Beat Lab'],
          ['beats', 'Биты'],
          ['gear', 'Техника'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="app-body scroll">
        {tab === 'maker' && <Beatmaker onEnergyChange={load} />}
        <div className="pad">
          <ErrorBox message={error?.message} onRetry={error?.action === 'retry' ? () => { load(); recorder.flush() } : null} onHome={() => setError(null)} />
        </div>
        {!studio && !error && <div className="center-fill muted">Загрузка…</div>}
        {studio && tab === 'rec' && (
          <div className="studio-rec">
            <div className="studio-title">Твой следующий сниппет</div>
            <button
              className={'mic' + (tap ? ' tap' : '')}
              onPointerDown={() => {
                setTap(true)
                onTap()
              }}
              onPointerUp={() => setTap(false)}
              onPointerLeave={() => setTap(false)}
              disabled={!recording.canTap || busy}
              aria-label="Микрофон: тапай, чтобы набрать хайп"
            >
              <Icon name="mic" size={84} stroke={1.8} />
            </button>
            <div className="studio-sub" role="status">{releasing ? 'Выпускаем сниппет…' : 'Тапай, чтобы набрать хайп'}</div>
            <PetCompanion pose={tap ? 'music' : studio.energy <= 0 ? 'sleep' : releases.length ? 'happy' : 'idle'} />
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
              <div className="row bar" key={b.id}>
                <div className="row-main">
                  {b.name}
                  <div className="muted small-t">Доход: ×{(b.base_streams / 150).toFixed(1)}</div>
                </div>
                {b.owned ? (
                  <button className="btn small" disabled={busy || b.id === studio.selected_beat_id} onClick={() => pick(b.id)}>
                    {b.id === studio.selected_beat_id ? 'ВЫБРАН' : 'ВЫБРАТЬ'}
                  </button>
                ) : (
                  <>
                    <span className="price">₽{b.price}</span>
                    <button className="btn small" disabled={busy || (player?.coins ?? 0) < b.price} onClick={() => buyBeatItem(b.id)}>
                      КУПИТЬ
                    </button>
                  </>
                )}
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
      {(releasing || releases.length > 0) && (
        <div className="release-shade">
          <section className="release-card" role="dialog" aria-modal="true" aria-labelledby="release-title">
            <div className="release-art" aria-hidden="true">
              <div className="release-disc"><span /></div>
              <div className="release-wave"><i /><i /><i /><i /><i /><i /><i /></div>
              <Icon name="cloud" size={30} color="var(--accent)" />
            </div>
            <div className="release-kicker">{releases.length ? 'НОВЫЙ РЕЛИЗ' : 'ЗАПИСЬ ГОТОВА'}</div>
            <h2 id="release-title">{releases.length ? 'Сниппет вышел!' : 'Выпускаем сниппет…'}</h2>
            <p className="muted release-copy">{releases.length ? 'Трек уже слушают. Продолжай записывать — следующая запись не за горами.' : 'Хайп собран. Сохраняем запись и ждём результат.'}</p>
            {releases.length > 0 ? <>
            <div className="release-stats" aria-live="polite">
              <div><b>+{releases[0].streams}</b><span>прослушиваний</span></div>
              <div><b>+{releases[0].coins}</b><span>монет</span></div>
              <div><b>+{releases[0].popularity_change}</b><span>популярности</span></div>
            </div>
            <button className="btn release-cta" onClick={() => recorder.acknowledgeRelease()}>
              ОТЛИЧНО
            </button>
            </> : <div role="status">
              {error ? <ErrorBox message={error.message} onRetry={() => recorder.flush()} /> : <div className="loader" />}
            </div>}
          </section>
        </div>
      )}
    </div>
  )
}
