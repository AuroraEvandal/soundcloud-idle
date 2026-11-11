import { memo, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { createConcertAudio } from './audio.js'
import { BEAT, EPISODES, GEAR } from './model.js'
import Controls from './Controls.jsx'
import { createConcertSession, concertClock } from './session.js'
import { concertAction } from '../api'
import { useGame } from '../GameContext'
import { errorInfo } from '../errors'
import './Concert.css'

const formatTime = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`
const vibrate = pattern => navigator.vibrate?.(pattern)

function Wave({ active = true }) {
  return <span className={`ct-wave ${active ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${20 + ((i * 37 + 13) % 77)}%`, '--d': `${i * -.13}s` }} />)}</span>
}

const Stage = memo(function Stage({ episode = 0, energy = 35, live = false, failed = false }) {
  const gig = EPISODES[episode]
  return <div className={`ct-stage ${live ? 'ct-stage-live' : ''} ${energy > 79 ? 'ct-stage-hot' : ''} ${failed ? 'ct-stage-dim' : ''}`} aria-label={`Сцена: ${gig.artist}`}>
    <div className="ct-stage-grid" />
    <div className="ct-beam ct-beam-one" /><div className="ct-beam ct-beam-two" /><div className="ct-beam ct-beam-three" />
    <div className="ct-stage-sign"><span>КЛУБ</span><strong>КОНТУР</strong><span>МЕСТО, ГДЕ ТЕБЯ СЛЫШАТ</span></div>
    <div className="ct-speaker ct-speaker-left"><i /><i /></div><div className="ct-speaker ct-speaker-right"><i /><i /></div>
    <img className="ct-performer" src={episode === 2 || episode === 4 ? '/opponents/arlekin40tysh.png' : '/player/freshman.png'} alt="" draggable="false" />
    <div className="ct-stage-floor" />
    <div className="ct-crowd" aria-hidden="true">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ '--i': i, '--ch': `${24 + (i * 17) % 38}px` }} />)}</div>
    <div className="ct-stage-top"><span className="ct-live-dot">{live ? 'LIVE' : 'СЕЗОН 01'}</span><span>{gig.crowd.toLocaleString('ru-RU')} в зале</span></div>
    {live && <div className="ct-stage-song"><span>{gig.artist}</span><b>{gig.track}</b></div>}
  </div>
})

function Meter({ label, value, color }) {
  return <div className="ct-meter"><div><span>{label}</span><b>{value}<small>/100</small></b></div><div className="ct-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i style={{ width: `${value}%`, background: color }} /></div></div>
}

function Calibration({ offset, setOffset, onClose }) {
  const [running, setRunning] = useState(false), [phase, setPhase] = useState(0), [taps, setTaps] = useState([]), [error, setError] = useState('')
  const audio = useRef(null), mounted = useRef(true), raf = useRef(null), started = useRef(false)
  useEffect(() => {
    const hide = () => {
      if (!document.hidden) return
      audio.current?.dispose(); audio.current = null; started.current = false; cancelAnimationFrame(raf.current)
      setRunning(false); setTaps([]); setError('Проверка остановлена при сворачивании. Можно начать заново.')
    }
    document.addEventListener('visibilitychange', hide)
    return () => { mounted.current = false; audio.current?.dispose(); cancelAnimationFrame(raf.current); document.removeEventListener('visibilitychange', hide) }
  }, [])
  useEffect(() => {
    if (!running) return
    function tick() { if (!mounted.current || !audio.current) return; setPhase((audio.current.time % BEAT) / BEAT); raf.current = requestAnimationFrame(tick) }
    tick(); return () => cancelAnimationFrame(raf.current)
  }, [running])
  async function start() {
    if (started.current) return
    started.current = true; setError('')
    const player = createConcertAudio(); audio.current = player
    try { const ok = await player.start(0, { metronome: true }); if (ok && mounted.current) setRunning(true) }
    catch { player.dispose(); started.current = false; if (mounted.current) setError('Не удалось включить звук. Попробуй ещё раз.') }
  }
  function tap() {
    const time = audio.current.time, delta = ((time + BEAT / 2) % BEAT - BEAT / 2) * 1000
    const next = [...taps, delta]; setTaps(next)
    if (next.length === 8) { setOffset(Math.round(next.reduce((a, b) => a + b, 0) / 8)); audio.current.dispose(); setRunning(false); started.current = false }
  }
  return <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Настройка задержки"><div className="ct-modal-card"><span className="ct-eyebrow">ПЕРЕД ВЫХОДОМ</span><h2>Попади в свой ритм</h2><p>Наушники могут задерживать звук. Нажми восемь раз под щелчки метронома — подстроим окно попадания.</p>
    <div className="ct-cal-beat" style={{ '--pulse': running && phase < .2 ? 1.07 : 1 }}><Icon name="headphones" size={48} /></div>
    {error && <p role="alert">{error}</p>}
    {running ? <button className="ct-primary" onClick={tap}>В РИТМ · {taps.length}/8</button> : <button className="ct-secondary" onClick={() => { setTaps([]); start() }}>{taps.length ? 'Проверить ещё раз' : 'Включить проверку'}</button>}
    <label className="ct-offset">Поправка <b>{offset > 0 ? '+' : ''}{offset} мс</b><input type="range" min="-250" max="250" step="5" value={offset} onChange={e => setOffset(Number(e.target.value))} aria-label="Поправка задержки в миллисекундах" /></label>
    <button className="ct-primary" onClick={onClose} disabled={running}>Готово</button><button className="ct-text-button" onClick={onClose}>Закрыть</button>
  </div></div>
}

export default function Concert({ onClose }) {
  const game = useGame()
  const [screen, setScreen] = useState('hub'), [tab, setTab] = useState('shows'), [episode, setEpisode] = useState(0)
  const [career, setCareer] = useState(null), [dialogue, setDialogue] = useState(0), [choice, setChoice] = useState('artist')
  const [show, setShow] = useState(null), [time, setTime] = useState(0), [sceneTime, setSceneTime] = useState(0), [paused, setPaused] = useState(false)
  const [notice, setNotice] = useState(null), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('')
  const [audioError, setAudioError] = useState(''), [calibrate, setCalibrate] = useState(false), [offset, setOffset] = useState(0), [mutedMode, setMutedMode] = useState(false)
  const [boosted, setBoosted] = useState(false), [effect, setEffect] = useState(false)
  const audio = useRef(null), currentShow = useRef(null), mounted = useRef(true), starting = useRef(false), pauseIntent = useRef(false), noticeTimer = useRef(null)
  const anchor = useRef({ at: performance.now(), elapsed: 0, scene: 0 }), timeoutSent = useRef(null), session = useRef(null), mode = useRef(screen)
  const stateCallback = useRef(null)
  mode.current = screen
  const gig = EPISODES[episode]
  const result = show?.result || null
  const active = show?.events?.[show.scene_index]
  const resolved = active && show?.outcomes?.[active.id]
  const index = show ? Object.keys(show.outcomes || {}).length : 0
  const total = show?.events.length || 18
  const wins = Object.values(show?.outcomes || {}).filter(outcome => outcome.success).length
  const phase = ['Саундчек', 'Первый трек', 'Аварийный режим', 'Финальный дроп'][Math.min(3, Math.floor(index * 4 / total))]

  stateCallback.current = response => {
    if (!mounted.current) return
    const next = response.show ? { ...response.show, failed: response.show.result?.rank === 'C' } : null
    setCareer(response.career); setShow(next); currentShow.current = next
    anchor.current = { at: performance.now(), ...concertClock(response) }
    setTime(anchor.current.elapsed); setSceneTime(anchor.current.scene)
    setPaused(Boolean(next?.paused) || pauseIntent.current); setLoadError('')
    if (response.player && game?.player && ['coins', 'xp', 'level'].some(key => response.player[key] !== game.player[key])) game.setPlayer(response.player)
    if (next?.status === 'active') setEpisode(next.episode)
    if (next?.status === 'finished' && mode.current === 'live') {
      pauseIntent.current = false
      audio.current?.dispose(); audio.current = null; setPaused(false); setScreen('result')
      game?.refreshProfile().catch(() => {})
    }
  }
  if (!session.current) session.current = createConcertSession(concertAction, response => stateCallback.current(response))
  async function command(action, ids = {}) {
    try { return await session.current.run(action, ids) }
    catch (error) { if (mounted.current) setLoadError(errorInfo(error).message); throw error }
  }
  async function retry() {
    setLoading(true)
    try {
      if (mode.current === 'live' && paused && !pauseIntent.current) await audio.current?.resume()
      const response = await session.current.retry()
      if (mode.current === 'live' && response.show?.status === 'active') {
        if (!response.show.paused && (pauseIntent.current || document.hidden)) pause()
        if (response.show.paused) audio.current?.pause()
      }
    } catch (e) { if (mounted.current) setLoadError(errorInfo(e).message) }
    finally { if (mounted.current) setLoading(false) }
  }
  useEffect(() => {
    command('get').catch(() => {})
    return () => { mounted.current = false; audio.current?.dispose(); clearTimeout(noticeTimer.current) }
  }, [])
  useEffect(() => {
    if (!paused && !calibrate) return
    const previous = document.activeElement
    const focus = requestAnimationFrame(() => document.querySelector('.ct-modal button:not(:disabled)')?.focus())
    const trap = e => {
      if (e.key !== 'Tab') return
      const controls = [...document.querySelectorAll('.ct-modal button:not(:disabled), .ct-modal input')]
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus() }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { cancelAnimationFrame(focus); document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus() }
  }, [paused, calibrate])
  useEffect(() => {
    const hide = () => { if (document.hidden && mode.current === 'live') pause() }
    const key = e => { if (e.key === 'Escape' && mode.current === 'live') pause() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('keydown', key)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('keydown', key) }
  }, [])
  useEffect(() => {
    if (screen !== 'live' || paused) return
    function tick() {
      if (!mounted.current || pauseIntent.current) return
      const delta = (performance.now() - anchor.current.at) / 1000
      setTime(anchor.current.elapsed + delta); setSceneTime(anchor.current.scene + delta)
      const s = currentShow.current, e = s?.events[s.scene_index]
      if (e && !s.outcomes[e.id] && anchor.current.scene + delta > e.duration + 1 && timeoutSent.current !== s.id + ':' + e.id && !loadError) {
        timeoutSent.current = s.id + ':' + e.id
        command('input', { showId: s.id, sceneId: e.id, actionId: 'timeout' })
          .catch(() => {}).finally(() => { timeoutSent.current = null })
      }
    }
    tick()
    const clockTimer = setInterval(tick, 50)
    return () => clearInterval(clockTimer)
  }, [screen, paused, loadError])
  useEffect(() => {
    if (screen !== 'live' || !resolved || paused || loadError) return
    const success = resolved.success
    const miss = { timeout: 'Время вышло', sequence: 'Порядок не совпал', channel: 'Выбран другой канал', request: 'Команда не совпала' }
    flash(success ? 'Сервер засчитал сцену' : (miss[resolved.reason] || 'Сцена не засчитана'), success ? 'good' : 'miss')
    audio.current?.set('damage', !success); vibrate(success ? 15 : [20,35,20])
    const advance = setTimeout(() => command('next', { showId: show.id, sceneId: active.id }).catch(() => {}), 650)
    return () => clearTimeout(advance)
  }, [screen, active?.id, Boolean(resolved), paused, loadError])
  function flash(text, type = 'good') { setNotice({ text, type }); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 850) }
  async function start(silent = false) {
    if (starting.current || !career) return
    starting.current = true; setLoading(true); setAudioError('')
    audio.current?.dispose(); const player = silent ? null : createConcertAudio(); audio.current = player
    try {
      if (player && !await player.start(episode)) return
      if (!mounted.current) return
      const existing = currentShow.current
      const response = existing?.status === 'active'
        ? await command(existing.paused ? 'resume' : 'get', existing.paused ? { showId: existing.id } : {})
        : await command('start', { episodeId: episode, choiceId: choice })
      if (!mounted.current) { player?.dispose(); return }
      if (!response.show || response.show.status === 'abandoned') { player?.dispose(); return }
      setChoice(response.show.choice); setEpisode(response.show.episode)
      if (response.show.status === 'finished') { player?.dispose(); setScreen('result'); return }
      setMutedMode(silent); setBoosted(false); setEffect(false); setNotice(null); setScreen('live')
      if (document.hidden) pause()
    } catch (e) { player?.dispose(); if (mounted.current) setAudioError(e.code ? errorInfo(e).message : e.message) }
    finally { starting.current = false; if (mounted.current) setLoading(false) }
  }
  function pause() {
    pauseIntent.current = true
    audio.current?.pause(); setPaused(true)
    const s = currentShow.current
    if (s?.status === 'active' && !s.paused) command('pause', { showId: s.id }).catch(() => {})
  }
  async function resume() {
    pauseIntent.current = false
    setLoading(true)
    try {
      await audio.current?.resume()
      const response = await command('resume', { showId: show.id })
      if (pauseIntent.current || document.hidden) { pause(); return }
      setPaused(Boolean(response.show?.paused)); setAudioError('')
    }
    catch (e) { audio.current?.pause(); setAudioError(e.code ? errorInfo(e).message : e.message) }
    finally { setLoading(false) }
  }
  async function leave() {
    setLoading(true)
    try { await command('abandon', { showId: show.id }); pauseIntent.current = false; audio.current?.dispose(); audio.current = null; setPaused(false); setScreen('hub'); setAudioError('') }
    catch {} finally { if (mounted.current) setLoading(false) }
  }
  async function buy(id) {
    setLoading(true)
    try { await command('buy', { itemId: id }); flash('Установлено. Забирай на следующий концерт.'); vibrate(15) }
    catch {} finally { if (mounted.current) setLoading(false) }
  }
  async function onAction(actionId) {
    const s = currentShow.current, e = s?.events[s.scene_index]
    if (!s || !e || loadError || paused || pauseIntent.current || s.outcomes[e.id]) return
    return command('input', { showId: s.id, sceneId: e.id, actionId })
  }
  const header = <header className="ct-header" inert={paused || calibrate}><button className="ct-icon-button" disabled={loading} aria-label={screen === 'hub' ? 'Закрыть концерт' : 'Назад'} onClick={() => screen === 'hub' ? onClose?.() : screen === 'live' ? pause() : setScreen('hub')}><Icon name="back" size={22} /></button><div className="ct-wordmark"><Icon name="cloud" size={22} /><b>SOUNDWAVE<span>BACKSTAGE</span></b></div><button className="ct-icon-button" aria-label="Настроить задержку звука" onClick={() => setCalibrate(true)} disabled={screen === 'live' || loading}><Icon name="headphones" size={21} /></button></header>
  if (!career) return <div className="ct-app">{header}<div className="center-fill"><h2>{loadError ? 'Нужен вход через Telegram' : 'Подключаем команду…'}</h2>{loadError && <><p className="ct-load-message" role="alert">{loadError}</p><button className="ct-primary" disabled={loading} onClick={retry}>Повторить подключение</button></>}</div></div>

  return <div className={`ct-app ${career.upgrades.includes('amber') ? 'ct-amber' : ''}`}>
    {header}
    {loadError && <div className="ct-error ct-network-error" role="alert">{loadError}<button disabled={loading} onClick={retry}>Восстановить связь с сервером</button></div>}
    {screen === 'hub' && <main className="ct-scroll ct-hub-scroll" inert={calibrate}>
      {audioError && <div className="ct-error" role="alert">{audioError}<button disabled={loading} onClick={() => start(true)}>Продолжить с визуальным пульсом</button></div>}
      <div className="ct-hub-heading"><span className="ct-eyebrow">ИНТЕРАКТИВНАЯ МУЗЫКАЛЬНАЯ ИСТОРИЯ</span><h1>Спаси<br /><em>концерт.</em></h1><p>Они выходят на сцену.<br />Ты делаешь так, чтобы их услышали.</p></div>
      <div className="ct-poster"><Stage episode={episode} /><div className="ct-poster-caption"><span>ГЛАВА 01 / ПОСЛЕДНИЙ СЕЗОН</span><strong>Пока здесь<br />есть звук.</strong><div><span><Icon name="mic" size={14} />6 выступлений</span><span>{show?.status === 'active' ? `${total} сцен в текущей попытке` : '18 сцен / концерт'}</span></div></div></div>
      <div className="ct-wallet"><div><span>Твой баланс</span><b>{career.coins.toLocaleString('ru-RU')} <small>₽</small></b></div><div><span>Репутация</span><b>{career.reputation} <small>REP</small></b></div><Icon name="headphones" size={30} /></div>
      <div className="ct-save-label">ПРОГРЕСС СОХРАНЯЕТСЯ · ОБЩИЙ КОШЕЛЁК ИГРОКА</div>
      {show?.status === 'finished' && result && <button className="ct-last-result" onClick={() => { setEpisode(show.episode); setChoice(show.choice); setScreen('result') }}>
        <span>Последний концерт</span><b>{result.rank} · {wins}/{total} зачтено</b>
      </button>}
      <nav className="ct-tabs" aria-label="Разделы концерта"><button className={tab === 'shows' ? 'is-active' : ''} onClick={() => setTab('shows')}>Выступления <span>06</span></button><button className={tab === 'gear' ? 'is-active' : ''} onClick={() => setTab('gear')}>Твой пульт <span>{career.upgrades.length}/5</span></button></nav>
      {tab === 'shows' ? <section className="ct-episodes" aria-label="Сюжетные концерты">{EPISODES.map((item, i) => {
        const unlocked = i === 0 || career.completed.includes(i - 1), completed = career.completed.includes(i)
        return <button key={item.title} className={`ct-episode ${episode === i ? 'is-selected' : ''}`} disabled={!unlocked || show?.status === 'active'} onClick={() => setEpisode(i)}><span className="ct-episode-number">{completed ? <Icon name="check" size={19} /> : String(i + 1).padStart(2, '0')}</span><span><b>{item.title}</b><small>{item.venue} · {item.crowd} человек</small></span>{unlocked ? <Icon name={episode === i ? 'cloud' : 'back'} size={21} /> : <Icon name="lock" size={18} />}</button>
      })}</section> : <section className="ct-gear" aria-label="Оборудование">{GEAR.map(item => { const owned = career.upgrades.includes(item.id); return <div key={item.id} className="ct-gear-item"><div className="ct-gear-icon"><Icon name={item.icon} size={24} /></div><div><h3>{item.name}</h3><p>{item.description}</p><button className="ct-buy" disabled={loading || owned || career.coins < item.price} onClick={() => buy(item.id)}>{owned ? 'Установлено ✓' : `${item.price} ₽ · Установить`}</button></div></div> })}</section>}
      {tab === 'shows' && <div className="ct-hub-action"><p><Icon name="headphones" size={15} />Лучше в наушниках. Каждый жест меняет звук.</p><button className="ct-primary" disabled={loading || Boolean(loadError)} onClick={() => { if (show?.status === 'active') start(); else { setDialogue(0); setScreen('story'); setAudioError('') } }}><span>{show?.status === 'active' ? 'Продолжить выступление' : career.completed.includes(episode) ? 'Вернуться на сцену' : 'Заступить на смену'}</span><span>↗</span></button><span className="ct-footnote">Вход свободный · оплачено {career.paid_today || 0}/5 сегодня</span></div>}
      <div className="ct-crew"><span>ТВОЯ КОМАНДА</span><div><b>Левый Берег</b><small>Доверие {career.trust}</small></div><div><b>Ирина</b><small>Надёжность {career.reliability}</small></div></div>
    </main>}

    {screen === 'story' && <main className="ct-scroll ct-story" inert={calibrate}><div className="ct-story-number">СМЕНА {String(episode + 1).padStart(2, '0')} / 06</div><h1>{gig.title}</h1><Stage episode={episode} /><p className="ct-story-setting">{gig.line}</p><div className="ct-dialogue"><div className="ct-avatar">{dialogue === 2 && choice === 'artist' ? 'Л' : gig.owner[0]}</div><div><span>{dialogue === 2 ? choice === 'artist' ? gig.artist : gig.owner : gig.owner}</span><p>{dialogue === 0 ? gig.dialogue : dialogue === 1 ? gig.dilemma : choice === 'artist' ? gig.artistReply : gig.ownerReply}</p></div></div>
      {dialogue === 1 ? <div className="ct-choices"><button onClick={() => { setChoice('artist'); setDialogue(2) }}><span>01</span><b>{gig.choiceA}</b><small>Больше живых команд и сложнее бит</small></button><button onClick={() => { setChoice('owner'); setDialogue(2) }}><span>02</span><b>{gig.choiceB}</b><small>Короткий бит и предсказуемый сет</small></button></div> : dialogue === 0 ? <button className="ct-primary" onClick={() => setDialogue(1)}>Выйти к сцене <span>↗</span></button> : <><div className="ct-mission"><Icon name="crown" size={19} /><span>Особая цель<b>6 действий подряд без ошибки</b></span><strong>+25 ₽</strong></div><p className="ct-story-tip">Настрой частоту · поймай уровень · запусти бит · сведи треки · убери свист · поддержи артиста · восстанови кабели · переживи блэкаут · удержи питание</p>{audioError && <div className="ct-error" role="alert">{audioError}<button onClick={() => start(true)}>Играть с визуальным пульсом</button></div>}<button className="ct-primary" disabled={loading} onClick={() => start()}>{loading ? 'Подключаем пульт…' : 'Начать концерт'}<span>↗</span></button><button className="ct-text-button" disabled={loading} onClick={() => setCalibrate(true)}>Проверить задержку звука</button></>}
    </main>}

    {screen === 'live' && show && <main className="ct-live" inert={paused}>
      <div className="ct-show-top"><div><span className="ct-eyebrow">СМЕНА {String(episode + 1).padStart(2, '0')} · {phase.toUpperCase()}</span><b>{gig.venue}</b></div><button className="ct-pause" aria-label="Пауза" onClick={pause}>Ⅱ</button></div>
      <div className="ct-live-scene"><Stage episode={episode} energy={show.energy} live failed={show.quality < 20 || (active?.kind === 'blackout' && sceneTime * 1000 > active.reveal_ms)} /><div className="ct-time"><span>{formatTime(time)}</span><i><b style={{ width: `${(show.scene_index / show.events.length) * 100}%` }} /></i><span>{index}/{total}</span></div></div>
      <div className="ct-meters"><Meter label="Качество звука" value={show.quality} color="var(--accent)" /><Meter label="Энергия зала" value={show.energy} color="#b9e579" /></div>
      <div className="ct-desk"><div className="ct-desk-top"><span>КОНТУР / MIXING DESK</span><span className="ct-pulse" style={{ opacity: time % BEAT < .12 ? 1 : .3 }}>● <b>120 BPM</b></span></div>
        <div className={`ct-scene-status ${notice?.type === 'miss' ? 'is-miss' : ''}`}>
          <span role="status">{notice?.text || `Сцена ${Math.min(index + 1, total)} из ${total}`}</span><b>{wins} зачтено</b>
        </div>
        {show.assisted && <div className="ct-assist">Ника рядом · зона попадания расширена</div>}
        {active && !resolved ? <Controls key={show.id + active.id} event={active} time={sceneTime} onAction={onAction} audio={audio.current} upgrades={career.upgrades} paused={paused || Boolean(loadError)} state={show} /> : <div className="ct-breathe"><Wave active={!paused} /><span className="ct-eyebrow">{index === total ? 'ПОСЛЕДНИЙ УДАР' : 'ПЕРЕСТРАИВАЕМ ПУЛЬТ'}</span><h2>{resolved?.success ? 'Держим этот звук.' : 'Следующая сцена.'}</h2><p>{index >= 6 ? gig.midway : 'Ника: «Дыши. Смотри на руки. Всё слышно».'}</p></div>}
        <div className="ct-desk-bottom"><span><i className={mutedMode ? '' : 'is-online'} />{mutedMode ? 'ВИЗУАЛЬНЫЙ РЕЖИМ' : 'MASTER OUT'}</span><span>{String(index).padStart(2, '0')} / {show.events.length}</span><b>×{show.combo}</b></div>
      </div>
      <div className="ct-live-actions"><button className="ct-boost" disabled={show.energy < 80 || boosted || index >= total} onClick={() => { setBoosted(true); audio.current?.set('boost', true); flash('ЗАЛ С ТОБОЙ · ЕЩЁ ГРОМЧЕ'); vibrate([20, 30, 20]) }}><Icon name="cloud" size={18} />{boosted ? 'Этот зал — твой' : show.energy >= 80 ? 'Зал с тобой · запустить дроп' : 'Особый дроп · от 80 энергии'}</button>{career.upgrades.includes('effects') && <button className={`ct-fx ${effect ? 'is-active' : ''}`} onClick={() => { setEffect(!effect); audio.current?.set('effect', !effect) }} aria-pressed={effect}>FX</button>}</div>
      <div className="ct-show-story">{time < 60 ? 'Ирина: «Сначала пусть услышат. Потом поверят».' : time < 95 ? gig.midway : time < 140 ? 'Ника: «Смотри на зал. Они уже с нами».' : 'Левый Берег: «Этот последний — для тех, кто остался».'}</div>
    </main>}

    {screen === 'result' && result && <main className="ct-scroll ct-result" inert={calibrate}><span className="ct-eyebrow">СМЕНА {String(episode + 1).padStart(2, '0')} ЗАВЕРШЕНА</span><div className={`ct-rank ct-rank-${result.rank}`}><span>ОЦЕНКА ВЫСТУПЛЕНИЯ</span><strong>{result.rank}</strong><Wave active={false} /></div><h1>{show.failed ? 'Сегодня было тяжело.' : episode === 5 ? 'Контур остаётся.' : result.rank === 'C' ? 'Свет ещё горит.' : 'Они нас услышали.'}</h1><p>{show.failed ? 'Ника выключает усилитель и садится рядом. «Плохой вечер не делает тебя плохим техником. Завтра попробуем ещё раз».' : episode === 5 ? 'Ирина читает сообщение от организатора. Потом молча показывает его команде. Клубу предлагают зимнюю резиденцию. Чайник торжественно подключают в другом здании.' : result.rank === 'C' ? '«Было криво. Но было живое». Левый Берег помогает сматывать кабели. Ирина уже пишет дату следующего концерта.' : 'Ирина стоит у выхода и не торопит людей. Ника впервые за вечер снимает наушники. «Вот теперь это место снова звучит».'}</p>
      <div className="ct-result-stats"><div><b>{wins}/{total}</b><span>сцен зачтено</span></div><div><b>×{show.bestCombo}</b><span>лучшая серия</span></div><div><b>+{result.xp || 0}</b><span>опыт</span></div></div>
      <p className="ct-result-rule">{show.failed ? `Для победы нужно зачесть ${Math.ceil(total * .55)} сцен из ${total}.` : !result.paid ? 'Смена засчитана. Сегодня уже оплачены пять концертов.' : 'Смена засчитана. Награда зачислена в общий кошелёк.'}</p>
      <div className="ct-receipt"><span className="ct-eyebrow">РАСЧЁТ ЗА ВЕЧЕР</span><div><span>Гонорар команды</span><b>+{result.base} ₽</b></div>{result.first && result.paid && <div><span>Первое успешное выступление</span><b>+50 ₽</b></div>}{result.goalFirst && result.paid && <div><span>6 действий без ошибки</span><b>+25 ₽</b></div>}<div className="ct-receipt-total"><span>В твой кошелёк</span><b>+{result.coins} ₽</b></div></div>
      <div className="ct-dialogue"><div className="ct-avatar">{choice === 'artist' ? 'Л' : 'И'}</div><div><span>{choice === 'artist' ? gig.artist : 'Ирина'}</span><p>{show.failed ? 'Мы ещё сыграем.' : choice === 'artist' ? '«Ты слышишь, что я хочу сказать. Это редкость».' : '«На тебя можно положиться. Сейчас это важнее всего».'}</p></div></div>
      <button className="ct-primary" onClick={() => { if (!show.failed && episode < 5) setEpisode(episode + 1); setTab('shows'); setScreen('hub') }}>{episode === 5 && !show.failed ? 'Вернуться в «Контур»' : show.failed ? 'Собраться и попробовать снова' : 'Следующая смена'}<span>↗</span></button><button className="ct-text-button" onClick={() => { setTab('gear'); setScreen('hub') }}>Обновить пульт · {career.coins} ₽</button>
    </main>}

    {screen === 'live' && paused && <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Концерт на паузе"><div className="ct-modal-card"><span className="ct-eyebrow">ТИШИНА ЗА ПУЛЬТОМ</span><h2>Выдохни.<br />Зал подождёт.</h2><p>Пауза сохраняется на сервере до двух минут. После этого текущая сцена будет пропущена.</p>{audioError && <p role="alert">{audioError}</p>}{loadError && <div className="ct-error" role="alert">{loadError}<button disabled={loading} onClick={retry}>Восстановить связь</button></div>}<button className="ct-primary" disabled={loading || Boolean(loadError)} onClick={resume}>Продолжить концерт <span>↗</span></button><button className="ct-secondary" disabled={loading || Boolean(loadError)} onClick={leave}>Завершить без награды</button><small>Чтобы продолжить позже, просто закрой приложение. Незавершённый концерт восстановится.</small></div></div>}
    {calibrate && <Calibration offset={offset} setOffset={setOffset} onClose={() => setCalibrate(false)} />}
    {screen === 'hub' && notice && <div className="ct-toast" role="status">{notice.text}</div>}
  </div>
}
