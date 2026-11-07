import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { createConcertAudio } from './audio.js'
import { BEAT, DURATION, EPISODES, GEAR, MECHANICS, initialCareer, makeShow, resolveEvent, finishShow, buyUpgrade, timingResult, targetAt } from './model.js'
import './Concert.css'

const formatTime = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const vibrate = pattern => navigator.vibrate?.(pattern)

function Wave({ active = true }) {
  return <span className={`ct-wave ${active ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${20 + ((i * 37 + 13) % 77)}%`, '--d': `${i * -.13}s` }} />)}</span>
}

function Stage({ episode = 0, energy = 35, live = false, failed = false }) {
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
}

function Meter({ label, value, color }) {
  return <div className="ct-meter"><div><span>{label}</span><b>{value}<small>/100</small></b></div><div className="ct-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i style={{ width: `${value}%`, background: color }} /></div></div>
}

function Knob({ value, onChange }) {
  const drag = useRef(null)
  function move(e) {
    if (!drag.current) return
    const { x, y } = drag.current
    let angle = Math.atan2(e.clientY - y, e.clientX - x) * 180 / Math.PI + 90
    if (angle > 180) angle -= 360
    onChange(Math.round(clamp((angle + 135) / 270 * 100)))
  }
  return <div className="ct-knob-wrap"><div className="ct-knob-scale" />
    <div className="ct-knob" role="slider" tabIndex={0} aria-label="Частота эквалайзера" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(80 * 2 ** (value / 14))} Гц`}
      onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); drag.current = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
      onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onKeyDown={e => { if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onChange(clamp(value + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 2 : -2))) } }}>
      <span style={{ transform: `rotate(${value * 2.7 - 135}deg)` }}><i /></span><b>EQ</b>
    </div><span className="ct-knob-min">80 Hz</span><span className="ct-knob-max">12 kHz</span>
  </div>
}

function Cue({ event, time, onFinish, audio, assisted, upgrades, offset, paused }) {
  const [value, setValue] = useState(event.kind === 'crossfade' ? 8 : 28)
  const [hold, setHold] = useState(0), [sequence, setSequence] = useState(0), [muted, setMuted] = useState(false)
  const [secondary, setSecondary] = useState(!event.secondary), [grade, setGrade] = useState('perfect')
  const last = useRef(time), held = useRef(0), pressedAt = useRef(null), done = useRef(false), seq = useRef(0)
  const currentValue = useRef(value), mistake = useRef(false)
  const info = MECHANICS[event.kind], target = targetAt(event, time)
  const tolerance = (assisted ? 17 : 10) + (upgrades.includes('knobs') ? 4 : 0)
  const age = time - event.at
  const progress = clamp(age / event.duration * 100)
  const requestLoop = event.kind === 'artist' && event.request === 'loop'
  const targetDuration = event.kind === 'frequency' ? .5 : event.kind === 'crossfade' ? 3.4 : 1

  function finish(result) {
    if (done.current) return
    done.current = true
    audio?.set('voice', true); audio?.set('loop', false); audio?.set('feedback', false)
    if (muted && event.kind === 'feedback') audio?.set('mute', { channel: event.channel, muted: false })
    onFinish(result)
  }
  function change(next) { currentValue.current = next; setValue(next); audio?.set(event.kind, next) }

  useEffect(() => {
    audio?.set('feedback', event.kind === 'feedback')
    return () => { audio?.set('voice', true); audio?.set('loop', false); audio?.set('feedback', false); if (event.kind === 'feedback') audio?.set('mute', { channel: event.channel, muted: false }) }
  }, [audio, event.kind, event.channel])

  useEffect(() => {
    if (paused || done.current) { last.current = time; return }
    const dt = Math.min(.1, Math.max(0, time - last.current)); last.current = time
    if (['frequency', 'level', 'crossfade'].includes(event.kind)) {
      const inZone = Math.abs(currentValue.current - targetAt(event, time)) <= tolerance
      held.current = inZone ? held.current + dt : event.kind === 'crossfade' ? Math.max(0, held.current - dt * .5) : 0
      setHold(held.current / targetDuration)
      if (held.current >= targetDuration && secondary) finish(mistake.current || assisted ? 'good' : 'perfect')
    }
    if (age >= event.duration) finish('miss')
  }, [time, paused, secondary])

  function pad(index) {
    if (paused || done.current) return
    audio?.previewPad(index); vibrate(12)
    if (event.sequence[seq.current] !== index) { finish('miss'); return }
    const result = timingResult(time, offset)
    if (result !== 'perfect') { setGrade('good'); mistake.current = true }
    if (result === 'miss') { finish('miss'); return }
    seq.current++; setSequence(seq.current)
    if (seq.current === event.sequence.length) finish(mistake.current ? 'good' : 'perfect')
  }
  function channel(index) {
    if (index !== event.channel) { finish('miss'); return }
    if (!muted) { setMuted(true); pressedAt.current = time; audio?.set('mute', { channel: index, muted: true }); audio?.set('feedback', false); vibrate(15) }
    else if (time - pressedAt.current >= .6) finish('perfect')
  }
  function command() {
    if (!muted) { setMuted(true); pressedAt.current = time; audio?.set(requestLoop ? 'loop' : 'voice', requestLoop); vibrate(15) }
    else if (time - pressedAt.current >= BEAT * 2) {
      const result = timingResult(time, offset)
      finish(result)
    }
  }
  const returnReady = muted && time - pressedAt.current >= (event.kind === 'feedback' ? .6 : BEAT * 2)
  const primaryLabel = requestLoop ? 'Повтори припев' : info.label
  return <div className="ct-cue" data-kind={event.kind}>
    <div className="ct-cue-heading"><span className="ct-eyebrow"><Icon name={info.icon} size={13} />{info.tag}</span><span className="ct-cue-seconds">{Math.max(0, event.duration - age).toFixed(1)} c</span></div>
    <h2>{primaryLabel}</h2><p>{requestLoop ? 'Включи петлю, выдержи два удара и отпусти в пульс.' : info.subtitle}</p>
    <div className={`ct-control ct-control-${event.kind}`}>
      {event.kind === 'frequency' && <><div className="ct-eq-readout"><b>{Math.round(80 * 2 ** (value / 14))}<small> Hz</small></b><span role="status" className={Math.abs(value - target) <= tolerance ? 'ct-green' : ''}>{Math.abs(value - target) <= tolerance ? 'Чистый сигнал' : 'Ищи чистую зону'}</span></div><Knob value={value} onChange={change} /><div className="ct-target-track"><i style={{ left: `${target - tolerance}%`, width: `${tolerance * 2}%` }} /><b style={{ left: `${value}%` }} /></div></>}
      {event.kind === 'level' && <><div className="ct-channel-scale"><span>−∞</span><span>−12</span><span>−6</span><span>0 dB</span></div><div className="ct-fader-zone"><i style={{ left: `${target - tolerance}%`, width: `${tolerance * 2}%` }} /><input type="range" min="0" max="100" value={value} onChange={e => change(Number(e.target.value))} aria-label="Уровень громкости" /></div><div className="ct-vu">{Array.from({ length: 25 }, (_, i) => <i key={i} className={i * 4 < value ? i > 21 ? 'red' : i > 17 ? 'amber' : 'lit' : ''} />)}</div><span className="ct-control-hint">Держи в оранжевой зоне · {Math.round(hold * 100)}%</span>
        {event.secondary && <button className={`ct-secondary-cue ${secondary ? 'is-done' : ''}`} disabled={secondary} onClick={() => { setSecondary(true); audio?.previewPad(2); vibrate(15) }}>{secondary ? 'Монитор включён ✓' : '＋ Вокал в монитор!'}</button>}</>}
      {event.kind === 'pads' && <><div className="ct-pad-sequence">{event.sequence.map((n, i) => <span key={i} className={i < sequence ? 'is-done' : i === sequence ? 'is-next' : ''}>{['K', 'S', 'H', 'V'][n]}</span>)}<span className="ct-pad-grade">{grade === 'good' ? 'В ритме' : '120 BPM'}</span></div><div className="ct-pads">{['KICK', 'SNARE', 'HI-HAT', 'VOICE'].map((label, i) => <button key={label} className={event.sequence[sequence] === i ? 'is-next' : ''} onClick={() => pad(i)} aria-label={label}><span>0{i + 1}</span><Icon name={['cloud', 'box', 'cards', 'mic'][i]} size={27} /><b>{label}</b></button>)}</div><span className="ct-control-hint">Нажимай в такт световому пульсу</span></>}
      {event.kind === 'crossfade' && <><div className="ct-decks"><div><b>A</b><Wave /><span>НЕ ВЫКЛЮЧАЙ</span></div><div><b>B</b><Wave /><span>НОВЫЙ КОНТУР</span></div></div><div className="ct-fader-zone"><i style={{ left: `${target - tolerance}%`, width: `${tolerance * 2}%` }} /><input type="range" min="0" max="100" value={value} onChange={e => change(Number(e.target.value))} aria-label="Кроссфейдер" /></div><span className="ct-control-hint">A <span>Следуй за оранжевой меткой</span> B</span></>}
      {event.kind === 'feedback' && <><div className="ct-channels">{['ВОКАЛ', 'БАС', 'КЛАВИШИ'].map((label, i) => <button key={label} onClick={() => channel(i)} className={`${i === event.channel ? 'ct-overload' : ''} ${muted && i === event.channel ? 'is-muted' : ''} ${upgrades.includes('marks') && i === event.channel ? 'ct-marked' : ''}`} aria-label={`${label}${i === event.channel ? ' · перегруз' : ''}: ${muted && i === event.channel ? 'вернуть' : 'приглушить'}`}><div className="ct-channel-leds">{Array.from({ length: 7 }, (_, n) => <i key={n} className={!(muted && i === event.channel) && (i === event.channel || n < 4) ? 'lit' : ''} />)}</div><b>{label}</b><span>{muted && i === event.channel ? returnReady ? 'ВЕРНУТЬ' : 'ЖДИ…' : 'MUTE'}</span></button>)}</div><span className="ct-control-hint">{muted ? returnReady ? 'Свист ушёл. Верни канал!' : 'Дай сигналу успокоиться…' : 'Красный индикатор выдаёт проблемный канал'}</span></>}
      {event.kind === 'artist' && <><div className="ct-artist-quote"><Icon name="mic" size={22} /><span>«{requestLoop ? 'Ещё раз припев! За мной!' : 'Сейчас вы! Я хочу вас услышать!'}»</span></div><button className={`ct-command ${muted ? 'is-active' : ''}`} onClick={command} disabled={muted && !returnReady}><Icon name={requestLoop ? 'cloud' : 'mic'} size={32} /><strong>{!muted ? requestLoop ? 'ВКЛЮЧИТЬ ПЕТЛЮ' : 'ОТДАТЬ ГОЛОС ЗАЛУ' : returnReady ? requestLoop ? 'ОТПУСТИТЬ В РИТМ' : 'ВЕРНУТЬ ГОЛОС' : 'ЗАЛ ПОЁТ…'}</strong><span>{muted ? returnReady ? 'На ближайший удар' : 'Два удара до возвращения' : 'Нажми, чтобы начать'}</span></button></>}
    </div>
    <div className="ct-cue-progress"><i style={{ width: `${100 - progress}%` }} /></div>
  </div>
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
  const [screen, setScreen] = useState('hub'), [tab, setTab] = useState('shows'), [episode, setEpisode] = useState(0)
  const [career, setCareer] = useState(initialCareer), [dialogue, setDialogue] = useState(0), [choice, setChoice] = useState('artist')
  const [show, setShow] = useState(null), [time, setTime] = useState(0), [paused, setPaused] = useState(false)
  const [result, setResult] = useState(null), [notice, setNotice] = useState(null), [loading, setLoading] = useState(false)
  const [audioError, setAudioError] = useState(''), [calibrate, setCalibrate] = useState(false), [offset, setOffset] = useState(0), [mutedMode, setMutedMode] = useState(false)
  const [boosted, setBoosted] = useState(false), [effect, setEffect] = useState(false)
  const audio = useRef(null), currentShow = useRef(null), currentTime = useRef(0), careerRef = useRef(career)
  const frame = useRef(null), noticeTimer = useRef(null), zeroAt = useRef(null), mounted = useRef(true), starting = useRef(false), muteClock = useRef({ at: 0, elapsed: 0 })
  const gig = EPISODES[episode]
  careerRef.current = career

  useEffect(() => () => { mounted.current = false; starting.current = false; audio.current?.dispose(); cancelAnimationFrame(frame.current); clearTimeout(noticeTimer.current) }, [])
  useEffect(() => {
    if (!paused && !calibrate) return
    const previous = document.activeElement
    const focus = requestAnimationFrame(() => document.querySelector('.ct-modal button:not(:disabled)')?.focus())
    const trap = e => {
      if (e.key !== 'Tab') return
      const controls = [...document.querySelectorAll('.ct-modal button:not(:disabled), .ct-modal input, .ct-modal [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { cancelAnimationFrame(focus); document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus() }
  }, [paused, calibrate])
  useEffect(() => {
    const hide = () => { if (document.hidden && screen === 'live') pause() }
    const key = e => { if (e.key === 'Escape' && screen === 'live') pause() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('keydown', key)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('keydown', key) }
  }, [screen])

  function flash(text, type = 'good') { setNotice({ text, type }); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 2100) }
  function resolve(id, outcome) {
    const next = resolveEvent(currentShow.current, id, outcome)
    if (next === currentShow.current) return
    currentShow.current = next; setShow(next)
    audio.current?.set('damage', outcome === 'miss')
    flash(outcome === 'perfect' ? `Идеально · ×${next.combo}` : outcome === 'good' ? `В ритме · ×${next.combo}` : 'Сбой. Дыши, следующий твой.', outcome)
    vibrate(outcome === 'miss' ? [20, 35, 20] : 15)
  }
  function endShow(failed = false) {
    const final = { ...currentShow.current, failed }
    currentShow.current = final; setShow(final)
    audio.current?.dispose(); audio.current = null
    const outcome = finishShow(careerRef.current, final)
    careerRef.current = outcome.career; setCareer(outcome.career); setResult(outcome.result); setScreen('result'); setPaused(false)
  }
  useEffect(() => {
    if (screen !== 'live' || paused) return
    function tick() {
      if (!mounted.current) return
      const elapsed = mutedMode ? muteClock.current.elapsed + (performance.now() - muteClock.current.at) / 1000 : audio.current?.time || 0
      currentTime.current = elapsed; setTime(elapsed)
      if (!mutedMode && audio.current?.suspended) { setPaused(true); return }
      let activeShow = currentShow.current
      for (const event of activeShow.events) if (elapsed >= event.at + event.duration && !Object.hasOwn(activeShow.outcomes, event.id)) {
        resolve(event.id, 'miss'); activeShow = currentShow.current
      }
      if (activeShow.quality === 0 && episode >= 2) {
        zeroAt.current ??= elapsed
        if (elapsed - zeroAt.current >= 10) { endShow(true); return }
      } else zeroAt.current = null
      if (elapsed >= DURATION) { endShow(); return }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [screen, paused, mutedMode, episode])

  async function start(silent = false) {
    if (starting.current) return
    starting.current = true; setLoading(true); setAudioError('')
    audio.current?.dispose(); const player = silent ? null : createConcertAudio(); audio.current = player
    try {
      if (player && !await player.start(episode)) return
      if (!mounted.current) return
      const next = makeShow(episode, choice, career.upgrades)
      currentShow.current = next; setShow(next); setTime(0); currentTime.current = 0; zeroAt.current = null
      muteClock.current = { at: performance.now(), elapsed: 0 }; setMutedMode(silent); setPaused(false); setBoosted(false); setEffect(false); setNotice(null); setScreen('live')
      if (document.hidden) { player?.pause(); setPaused(true) }
    } catch (e) { player?.dispose(); if (mounted.current) setAudioError(e.message || 'Не удалось включить звук. Повтори запуск.') }
    finally { starting.current = false; if (mounted.current) setLoading(false) }
  }
  function pause() { audio.current?.pause(); muteClock.current.elapsed = currentTime.current; setPaused(true) }
  async function resume() {
    try { await audio.current?.resume(); muteClock.current.at = performance.now(); setAudioError(''); setPaused(false) }
    catch (e) { setAudioError(e.message) }
  }
  function leave() { audio.current?.dispose(); audio.current = null; setPaused(false); setScreen('hub'); setAudioError('') }
  function buy(id) {
    const next = buyUpgrade(career, id)
    if (next !== career) { setCareer(next); flash('Установлено. Забирай на следующий концерт.'); vibrate(15) }
  }
  const active = show?.events.find(e => time >= e.at && time < e.at + e.duration && !Object.hasOwn(show.outcomes, e.id))
  const nextEvent = show?.events.find(e => e.at > time)
  const phase = time < 20 ? 'Саундчек' : time < 60 ? 'Первый трек' : time < 95 ? 'Неполадка' : time < 140 ? 'Разгон' : time < 165 ? 'Финальный дроп' : 'Послесловие'
  const index = show ? Object.keys(show.outcomes).length : 0
  const header = <header className="ct-header" inert={paused || calibrate}><button className="ct-icon-button" disabled={loading} aria-label={screen === 'hub' ? 'Закрыть концерт' : 'Назад'} onClick={() => screen === 'hub' ? onClose?.() : screen === 'live' ? pause() : setScreen('hub')}><Icon name="back" size={22} /></button><div className="ct-wordmark"><Icon name="cloud" size={22} /><b>SOUNDWAVE<span>BACKSTAGE</span></b></div><button className="ct-icon-button" aria-label="Настроить задержку звука" onClick={() => setCalibrate(true)} disabled={screen === 'live' || loading}><Icon name="headphones" size={21} /></button></header>

  return <div className={`ct-app ${career.upgrades.includes('amber') ? 'ct-amber' : ''}`}>
    {header}
    {screen === 'hub' && <main className="ct-scroll ct-hub-scroll" inert={calibrate}>
      <div className="ct-hub-heading"><span className="ct-eyebrow">ИНТЕРАКТИВНАЯ МУЗЫКАЛЬНАЯ ИСТОРИЯ</span><h1>Спаси<br /><em>концерт.</em></h1><p>Они выходят на сцену.<br />Ты делаешь так, чтобы их услышали.</p></div>
      <div className="ct-poster"><Stage episode={episode} /><div className="ct-poster-caption"><span>ГЛАВА 01 / ПОСЛЕДНИЙ СЕЗОН</span><strong>Пока здесь<br />есть звук.</strong><div><span><Icon name="mic" size={14} />6 выступлений</span><span>3 мин / концерт</span></div></div></div>
      <div className="ct-wallet"><div><span>Бюджет команды</span><b>{career.coins.toLocaleString('ru-RU')} <small>₽</small></b></div><div><span>Репутация</span><b>{career.reputation} <small>REP</small></b></div><Icon name="headphones" size={30} /></div>
      <div className="ct-demo-label">ПРОТОТИП · демопрогресс до выхода из режима</div>
      <nav className="ct-tabs" aria-label="Разделы концерта"><button className={tab === 'shows' ? 'is-active' : ''} onClick={() => setTab('shows')}>Выступления <span>06</span></button><button className={tab === 'gear' ? 'is-active' : ''} onClick={() => setTab('gear')}>Твой пульт <span>{career.upgrades.length}/5</span></button></nav>
      {tab === 'shows' ? <section className="ct-episodes" aria-label="Сюжетные концерты">{EPISODES.map((item, i) => {
        const unlocked = i === 0 || career.completed.includes(i - 1), completed = career.completed.includes(i)
        return <button key={item.title} className={`ct-episode ${episode === i ? 'is-selected' : ''}`} disabled={!unlocked} onClick={() => setEpisode(i)}><span className="ct-episode-number">{completed ? <Icon name="check" size={19} /> : String(i + 1).padStart(2, '0')}</span><span><b>{item.title}</b><small>{item.venue} · {item.crowd} человек</small></span>{unlocked ? <Icon name={episode === i ? 'cloud' : 'back'} size={21} /> : <Icon name="lock" size={18} />}</button>
      })}</section> : <section className="ct-gear" aria-label="Оборудование">{GEAR.map(item => { const owned = career.upgrades.includes(item.id); return <div key={item.id} className="ct-gear-item"><div className="ct-gear-icon"><Icon name={item.icon} size={24} /></div><div><h3>{item.name}</h3><p>{item.description}</p><button className="ct-buy" disabled={owned || career.coins < item.price} onClick={() => buy(item.id)}>{owned ? 'Установлено ✓' : `${item.price} ₽ · Установить`}</button></div></div> })}</section>}
      {tab === 'shows' && <div className="ct-hub-action"><p><Icon name="headphones" size={15} />Лучше в наушниках. Каждый жест меняет звук.</p><button className="ct-primary" onClick={() => { setDialogue(0); setScreen('story'); setAudioError('') }}><span>{career.completed.includes(episode) ? 'Вернуться на сцену' : 'Заступить на смену'}</span><span>↗</span></button><span className="ct-footnote">Вход свободный. Даже после плохого вечера.</span></div>}
      <div className="ct-crew"><span>ТВОЯ КОМАНДА</span><div><b>Левый Берег</b><small>Доверие {career.trust}</small></div><div><b>Ирина</b><small>Надёжность {career.reliability}</small></div></div>
    </main>}

    {screen === 'story' && <main className="ct-scroll ct-story" inert={calibrate}><div className="ct-story-number">СМЕНА {String(episode + 1).padStart(2, '0')} / 06</div><h1>{gig.title}</h1><Stage episode={episode} /><p className="ct-story-setting">{gig.line}</p><div className="ct-dialogue"><div className="ct-avatar">{dialogue === 2 && choice === 'artist' ? 'Л' : gig.owner[0]}</div><div><span>{dialogue === 2 ? choice === 'artist' ? gig.artist : gig.owner : gig.owner}</span><p>{dialogue === 0 ? gig.dialogue : dialogue === 1 ? gig.dilemma : choice === 'artist' ? gig.artistReply : gig.ownerReply}</p></div></div>
      {dialogue === 1 ? <div className="ct-choices"><button onClick={() => { setChoice('artist'); setDialogue(2) }}><span>01</span><b>{gig.choiceA}</b><small>Больше живых команд и сложнее бит</small></button><button onClick={() => { setChoice('owner'); setDialogue(2) }}><span>02</span><b>{gig.choiceB}</b><small>Короткий бит и предсказуемый сет</small></button></div> : dialogue === 0 ? <button className="ct-primary" onClick={() => setDialogue(1)}>Выйти к сцене <span>↗</span></button> : <><div className="ct-mission"><Icon name="crown" size={19} /><span>Особая цель<b>6 действий подряд без ошибки</b></span><strong>+50 ₽</strong></div><p className="ct-story-tip">Настрой частоту · поймай уровень · запусти бит · сведи треки · убери свист · поддержи артиста</p>{audioError && <div className="ct-error" role="alert">{audioError}<button onClick={() => start(true)}>Играть с визуальным пульсом</button></div>}<button className="ct-primary" disabled={loading} onClick={() => start()}>{loading ? 'Подключаем пульт…' : 'Начать концерт'}<span>↗</span></button><button className="ct-text-button" disabled={loading} onClick={() => setCalibrate(true)}>Проверить задержку звука</button></>}
    </main>}

    {screen === 'live' && show && <main className="ct-live" inert={paused}>
      <div className="ct-show-top"><div><span className="ct-eyebrow">СМЕНА {String(episode + 1).padStart(2, '0')} · {phase.toUpperCase()}</span><b>{gig.venue}</b></div><button className="ct-pause" aria-label="Пауза" onClick={pause}>Ⅱ</button></div>
      <div className="ct-live-scene"><Stage episode={episode} energy={show.energy} live failed={show.quality < 20} /><div className="ct-time"><span>{formatTime(time)}</span><i><b style={{ width: `${time / DURATION * 100}%` }} /></i><span>3:00</span></div></div>
      <div className="ct-meters"><Meter label="Качество звука" value={show.quality} color="var(--accent)" /><Meter label="Энергия зала" value={show.energy} color="#b9e579" /></div>
      <div className="ct-desk"><div className="ct-desk-top"><span>КОНТУР / MIXING DESK</span><span className="ct-pulse" style={{ opacity: time % BEAT < .12 ? 1 : .3 }}>● <b>120 BPM</b></span></div>
        {notice && <div className={`ct-feedback ct-feedback-${notice.type}`} role="status">{notice.text}</div>}
        {show.assisted && <div className="ct-assist">Ника рядом · зона попадания расширена</div>}
        {active ? <Cue key={active.id} event={active} time={time} onFinish={outcome => resolve(active.id, outcome)} audio={audio.current} assisted={show.assisted} upgrades={career.upgrades} offset={offset} paused={paused} /> : <div className="ct-breathe"><Wave active={!paused} /><span className="ct-eyebrow">{time >= 165 ? 'ТЫ СДЕЛАЛ ЭТО' : time >= 60 && time < 67 ? 'В ГАРНИТУРЕ' : 'СЛУШАЙ. ТЫ ВНУТРИ МУЗЫКИ.'}</span><h2>{time < 3 ? 'Всё начинается с тебя.' : time >= 165 ? 'Пусть этот момент звучит.' : time >= 60 && time < 67 ? '«Не трогай чайник»' : 'Держим этот звук.'}</h2><p>{time >= 165 ? 'Последние такты. Посмотри на зал.' : time >= 60 && time < 67 ? gig.midway : nextEvent ? `Далее: ${MECHANICS[nextEvent.kind].tag.toLowerCase()} · через ${Math.ceil(nextEvent.at - time)} с` : 'Зал запомнит этот вечер.'}</p></div>}
        <div className="ct-desk-bottom"><span><i className={mutedMode ? '' : 'is-online'} />{mutedMode ? 'ВИЗУАЛЬНЫЙ РЕЖИМ' : 'MASTER OUT'}</span><span>{String(index).padStart(2, '0')} / 24</span><b>×{show.combo}</b></div>
      </div>
      <div className="ct-live-actions"><button className="ct-boost" disabled={show.energy < 80 || boosted || time >= 165} onClick={() => { setBoosted(true); audio.current?.set('boost', true); flash('ЗАЛ С ТОБОЙ · ЕЩЁ ГРОМЧЕ'); vibrate([20, 30, 20]) }}><Icon name="cloud" size={18} />{boosted ? 'Этот зал — твой' : show.energy >= 80 ? 'Зал с тобой · запустить дроп' : 'Особый дроп · от 80 энергии'}</button>{career.upgrades.includes('effects') && <button className={`ct-fx ${effect ? 'is-active' : ''}`} onClick={() => { setEffect(!effect); audio.current?.set('effect', !effect) }} aria-pressed={effect}>FX</button>}</div>
      <div className="ct-show-story">{time < 60 ? 'Ирина: «Сначала пусть услышат. Потом поверят».' : time < 95 ? gig.midway : time < 140 ? 'Ника: «Смотри на зал. Они уже с нами».' : 'Левый Берег: «Этот последний — для тех, кто остался».'}</div>
    </main>}

    {screen === 'result' && result && <main className="ct-scroll ct-result" inert={calibrate}><span className="ct-eyebrow">СМЕНА {String(episode + 1).padStart(2, '0')} ЗАВЕРШЕНА</span><div className={`ct-rank ct-rank-${result.rank}`}><span>ОЦЕНКА ВЫСТУПЛЕНИЯ</span><strong>{result.rank}</strong><Wave active={false} /></div><h1>{show.failed ? 'Сегодня было тяжело.' : episode === 5 ? 'Контур остаётся.' : result.rank === 'C' ? 'Свет ещё горит.' : 'Они нас услышали.'}</h1><p>{show.failed ? 'Ника выключает усилитель и садится рядом. «Плохой вечер не делает тебя плохим техником. Завтра попробуем ещё раз».' : episode === 5 ? 'Ирина читает сообщение от организатора. Потом молча показывает его команде. Клубу предлагают зимнюю резиденцию. Чайник торжественно подключают в другом здании.' : result.rank === 'C' ? '«Было криво. Но было живое». Левый Берег помогает сматывать кабели. Ирина уже пишет дату следующего концерта.' : 'Ирина стоит у выхода и не торопит людей. Ника впервые за вечер снимает наушники. «Вот теперь это место снова звучит».'}</p>
      <div className="ct-result-stats"><div><b>{result.accuracy}%</b><span>точность</span></div><div><b>×{show.bestCombo}</b><span>лучшая серия</span></div><div><b>+{result.reputation}</b><span>репутация</span></div></div>
      <div className="ct-receipt"><span className="ct-eyebrow">РАСЧЁТ ЗА ВЕЧЕР</span><div><span>Гонорар команды</span><b>+{result.base} ₽</b></div>{result.first && <div><span>Первое выступление</span><b>+100 ₽</b></div>}{result.goalFirst && <div><span>6 действий без ошибки</span><b>+50 ₽</b></div>}<div className="ct-receipt-total"><span>В бюджет клуба</span><b>+{result.base + result.bonus} ₽</b></div></div>
      <div className="ct-dialogue"><div className="ct-avatar">{choice === 'artist' ? 'Л' : 'И'}</div><div><span>{choice === 'artist' ? gig.artist : 'Ирина'}</span><p>{show.failed ? 'Мы ещё сыграем.' : choice === 'artist' ? '«Ты слышишь, что я хочу сказать. Это редкость».' : '«На тебя можно положиться. Сейчас это важнее всего».'}</p></div></div>
      <button className="ct-primary" onClick={() => { if (!show.failed && episode < 5) setEpisode(episode + 1); setTab('shows'); setScreen('hub') }}>{episode === 5 && !show.failed ? 'Вернуться в «Контур»' : show.failed ? 'Собраться и попробовать снова' : 'Следующая смена'}<span>↗</span></button><button className="ct-text-button" onClick={() => { setTab('gear'); setScreen('hub') }}>Обновить пульт · {career.coins} ₽</button>
    </main>}

    {screen === 'live' && paused && <div className="ct-modal" role="dialog" aria-modal="true" aria-label="Концерт на паузе"><div className="ct-modal-card"><span className="ct-eyebrow">ТИШИНА ЗА ПУЛЬТОМ</span><h2>Выдохни.<br />Зал подождёт.</h2><p>Музыка и задания остановлены. Вернёшься в тот же момент.</p>{audioError && <p role="alert">{audioError}</p>}<button className="ct-primary" onClick={resume}>Продолжить концерт <span>↗</span></button><button className="ct-secondary" onClick={leave}>Закончить репетицию</button><small>Незавершённое выступление не приносит наград.</small></div></div>}
    {calibrate && <Calibration offset={offset} setOffset={setOffset} onClose={() => setCalibrate(false)} />}
    {screen === 'hub' && notice && <div className="ct-toast" role="status">{notice.text}</div>}
  </div>
}


