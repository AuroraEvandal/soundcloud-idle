import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { clampControl, controlAction, createControlStream, targetPosition } from './controlTransport.js'
import './controls.css'

const CHANNELS = ['ВОКАЛ', 'БАС', 'КЛАВИШИ']
const PADS = ['KICK', 'SNARE', 'HI-HAT', 'VOICE']
const ICONS = ['cloud', 'box', 'cards', 'mic']
const COMMANDS = {
  'voice-off': ['Голос — залу', 'УБРАТЬ ВОКАЛ', '«Теперь вы! Я хочу вас услышать!»'],
  'voice-on': ['Артист возвращается', 'ВЕРНУТЬ ВОКАЛ', '«Я снова с вами. Дай мой голос!»'],
  'loop-on': ['Ещё раз припев', 'ВКЛЮЧИТЬ ПЕТЛЮ', '«Повтори припев! За мной!»'],
  'loop-off': ['В новый куплет', 'ОТПУСТИТЬ ПЕТЛЮ', '«Выходим из припева. Погнали дальше!»'],
}
const TITLES = {
  frequency: ['Убери гул', 'ЧАСТОТА', 'headphones'],
  level: ['Держи уровень', 'КАНАЛ / GAIN', 'cloud'],
  pads: ['Собери бит', 'СЭМПЛЕР', 'cards'],
  crossfade: ['Сведи два трека', 'ПЕРЕХОД / A → B', 'cloud'],
  feedback: ['Убери свист', 'АВАРИЯ / FEEDBACK', 'headphones'],
  artist: ['Слушай артиста', 'КОМАНДА СО СЦЕНЫ', 'mic'],
  patch: ['Собери звуковую цепь', 'КОММУТАЦИЯ / PATCH', 'chain'],
  blackout: ['Свет погас. Звук остаётся.', 'ПАМЯТЬ / BLACKOUT', 'lock'],
  power: ['Верни питание', 'ПИТАНИЕ / POWER', 'box'],
}

export function Wave({ active = true }) {
  return <span className={`ct-wave ${active ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${20 + ((i * 37 + 13) % 77)}%`, '--d': `${i * -.13}s` }} />)}</span>
}

function Knob({ value, onChange, disabled, describedBy }) {
  const drag = useRef(null)
  function move(e) {
    if (!drag.current || disabled) return
    const { x, y, start } = drag.current
    onChange(Math.round(clampControl(start + (y - e.clientY + (e.clientX - x) * .5) / 1.2)))
  }
  function keyboard(e) {
    if (disabled) return
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (step || ['Home', 'End', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault()
      onChange(clampControl(e.key === 'Home' ? 0 : e.key === 'End' ? 100 : value + (step || 0)))
    }
  }
  return <div className="ct-knob-wrap"><div className="ct-knob-scale" />
    <div className="ct-knob" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label="Частота эквалайзера" aria-describedby={describedBy} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(80 * 2 ** (value / 14))} герц`}
      onPointerDown={e => { if (disabled) return; drag.current = { x: e.clientX, y: e.clientY, start: value }; e.currentTarget.setPointerCapture(e.pointerId); onChange(value) }}
      onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} onKeyDown={keyboard}>
      <span style={{ transform: `rotate(${value * 2.7 - 135}deg)` }}><i /></span><b>EQ</b>
    </div><span className="ct-knob-min">80 Hz</span><span className="ct-knob-max">12 kHz</span>
  </div>
}

function Pattern({ sequence, step, labels, hidden = false }) {
  return <div className={`ct-pattern ${hidden ? 'is-hidden' : ''}`} aria-label={hidden ? 'Последовательность скрыта. Повтори её по памяти.' : `Порядок: ${sequence.map(n => labels[n]).join(', ')}. Выполнено ${step} из ${sequence.length}.`}>
    {sequence.map((n, i) => <span key={i} className={i < step ? 'is-done' : i === step ? 'is-next' : ''} aria-hidden="true">{i < step ? <Icon name="check" size={13} /> : hidden ? '·' : labels[n]}</span>)}
    <b aria-hidden="true">{step}/{sequence.length}</b>
  </div>
}

function SceneControls({ event, time, onAction, audio, upgrades = [], paused, state }) {
  const progress = state?.scene_progress || {}
  const [value, setValue] = useState(progress.value ?? (event.kind === 'crossfade' ? 8 : 28))
  const [pending, setPending] = useState(false)
  const touched = useRef(false), latest = useRef(onAction), sending = useRef(false), stream = useRef(null)
  latest.current = onAction
  if (!stream.current) stream.current = createControlStream(action => latest.current(action))
  const resolved = Object.hasOwn(state?.outcomes || {}, event.id)
  const disabled = paused || resolved || time >= event.duration
  const continuous = ['frequency', 'level', 'crossfade'].includes(event.kind)
  const target = continuous ? targetPosition(event, time) : 0
  const zoneStart = clampControl(target - event.tolerance), zoneEnd = clampControl(target + event.tolerance)
  const hold = clampControl((progress.hold_ms || 0) / (event.hold_ms || 1) * 100)
  const step = progress.step || 0, sequence = event.sequence || []
  const remaining = Math.max(0, event.duration - time)
  const returning = step > 0 && ['feedback', 'artist'].includes(event.kind)
  const releaseReady = returning && time * 1000 >= progress.release_at_ms
  const releaseWait = Math.max(0, ((progress.release_at_ms || 0) - time * 1000) / 1000)
  const revealing = event.kind === 'blackout' && time * 1000 < (event.reveal_ms || 1200)
  const commandId = returning && event.kind === 'artist' ? event.request === 'loop-on' ? 'loop-off' : 'voice-on' : event.request
  const info = TITLES[event.kind], command = COMMANDS[commandId]
  const hintId = `ct-guide-${event.id}`
  const zoneId = `ct-zone-${event.id}`

  useEffect(() => {
    if (disabled || !continuous) stream.current.stop()
    else if (touched.current) stream.current.update(controlAction(event.kind, value))
  }, [disabled, continuous, event.kind, value])
  useEffect(() => () => stream.current.stop(), [])
  useEffect(() => {
    return () => {
      audio?.set('voice', true); audio?.set('loop', false); audio?.set('feedback', false)
      if (event.kind === 'feedback') for (let channel = 0; channel < 3; channel++) audio?.set('mute', { channel, muted: false })
    }
  }, [audio, event.kind, event.request])
  useEffect(() => {
    if (event.kind === 'feedback') {
      audio?.set('feedback', !resolved && !progress.muted?.includes(event.channel))
      for (let channel = 0; channel < 3; channel++) audio?.set('mute', { channel, muted: !!progress.muted?.includes(channel) })
    }
    if (event.kind === 'artist') {
      audio?.set('voice', progress.voice ?? true)
      audio?.set('loop', progress.loop ?? false)
    }
  }, [audio, event.kind, event.channel, progress.muted, progress.voice, progress.loop, resolved])

  function change(next) {
    if (disabled) return
    touched.current = true
    setValue(next)
    audio?.set(event.kind, next)
    stream.current.update(controlAction(event.kind, next))
  }
  async function act(action, preview) {
    if (disabled || sending.current) return
    sending.current = true; setPending(true)
    preview?.()
    navigator.vibrate?.(12)
    try { await onAction(action) }
    catch { /* The parent owns the error message and retry. */ }
    finally { sending.current = false; setPending(false) }
  }
  function sequenceAction(index) {
    if (revealing) return
    const prefix = { pads: 'pad', patch: 'patch', blackout: 'memory', power: 'power' }[event.kind]
    if (prefix) act(`${prefix}-${index}`, () => audio?.previewPad(index))
  }
  function channelAction(index) {
    const muted = progress.muted?.includes(index)
    if (muted && !releaseReady) return
    act(`${muted ? 'unmute' : 'mute'}-${index}`, () => { audio?.set('mute', { channel: index, muted: !muted }); if (!muted) audio?.set('feedback', false) })
  }
  function key(e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || !/^[1-4]$/.test(e.key) || continuous) return
    const index = Number(e.key) - 1
    if (event.kind === 'feedback' && index < 3) { e.preventDefault(); channelAction(index) }
    else if (['pads', 'patch', 'blackout', 'power'].includes(event.kind)) { e.preventDefault(); sequenceAction(index) }
  }
  const holdGuide = <div className="ct-hold-guide"><span>{event.moving ? 'Следуй за живой зоной' : 'Удерживай оранжевую зону'}</span><b>{((progress.hold_ms || 0) / 1000).toFixed(1)} / {(event.hold_ms / 1000).toFixed(1)} с</b><i role="progressbar" aria-label="Подтверждённое сервером удержание" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hold)}><em style={{ width: `${hold}%` }} /></i></div>
  const fader = <div className="ct-fader-zone"><i style={{ left: `${zoneStart}%`, width: `${zoneEnd - zoneStart}%` }} /><input type="range" min="0" max="100" step="1" value={value} disabled={disabled} onChange={e => change(Number(e.target.value))} onPointerDown={() => change(value)} onKeyDown={e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); change(value) } }} aria-label={event.kind === 'crossfade' ? 'Кроссфейдер от A к B' : 'Уровень громкости'} aria-describedby={`${hintId} ${zoneId}`} /></div>

  return <section className={`ct-cue ct-controls ${revealing ? 'is-revealing' : ''}`} data-kind={event.kind} aria-label={info[0]} aria-busy={pending} onKeyDown={key}>
    <div className="ct-cue-heading"><span className="ct-eyebrow"><Icon name={info[2]} size={13} />{info[1]}</span><span className="ct-cue-seconds" aria-label={`Осталось ${Math.ceil(remaining)} секунд`}>{remaining.toFixed(1)} c</span></div>
    <h2>{event.kind === 'artist' && command ? command[0] : info[0]}</h2>
    <p id={hintId}>{continuous ? `Двигай регулятор и удерживай сигнал ${(event.hold_ms / 1000).toFixed(1)} с.${event.secondary ? ' Включи монитор для вокала.' : ''}` : event.kind === 'pads' ? 'Набери рисунок слева направо. Каждый пэд — часть бита.' : event.kind === 'feedback' ? 'Приглуши перегруженный канал. Когда свист уйдёт — верни его.' : event.kind === 'artist' ? 'Выполни команду, выдержи два удара, затем верни звук.' : event.kind === 'patch' ? 'Подключай входы по одному к выходам в указанном порядке.' : event.kind === 'blackout' ? 'Запомни порядок ламп, затем повтори его в темноте.' : 'Включи блоки строго в порядке на схеме.'}</p>
    {continuous && <span className="ct-control-sr" id={zoneId}>Целевая зона: от {Math.ceil(zoneStart)} до {Math.floor(zoneEnd)} процентов.{event.moving ? ' Зона движется.' : ''}</span>}
    <div className={`ct-control ct-control-${event.kind}`}>
      {event.kind === 'frequency' && <><div className="ct-eq-readout"><b>{Math.round(80 * 2 ** (value / 14))}<small> Hz</small></b><span>{event.moving ? 'ЖИВАЯ ЧАСТОТА' : 'НАЙДИ ЧИСТЫЙ ГОЛОС'}</span></div><Knob value={value} onChange={change} disabled={disabled} describedBy={`${hintId} ${zoneId}`} /><div className="ct-target-track" aria-hidden="true"><i style={{ left: `${zoneStart}%`, width: `${zoneEnd - zoneStart}%` }} /><b style={{ left: `${value}%` }} /></div>{holdGuide}</>}
      {event.kind === 'level' && <><div className="ct-channel-scale" aria-hidden="true"><span>−∞</span><span>−12</span><span>−6</span><span>0 dB</span></div>{fader}<div className="ct-vu" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} className={i * 4 < value ? i > 21 ? 'red' : i > 17 ? 'amber' : 'lit' : ''} />)}</div>{holdGuide}{event.secondary && <button className={`ct-secondary-cue ${progress.monitor ? 'is-done' : ''}`} disabled={disabled || pending || progress.monitor} onClick={() => act('monitor', () => audio?.previewPad(2))}><Icon name="headphones" size={16} />{progress.monitor ? 'Вокал в мониторе ✓' : 'Вокал в монитор!'}<small>ВТОРАЯ ЗАДАЧА</small></button>}</>}
      {event.kind === 'crossfade' && <><div className="ct-decks"><div><b>A</b><Wave active={!paused} /><span>ТЕКУЩИЙ ТРЕК</span></div><div><b>B</b><Wave active={!paused} /><span>НОВЫЙ КОНТУР</span></div></div>{fader}{holdGuide}</>}
      {event.kind === 'pads' && <><Pattern sequence={sequence} step={step} labels={['K', 'S', 'H', 'V']} /><div className="ct-pads">{PADS.map((label, i) => <button key={label} disabled={disabled || pending} className={sequence[step] === i ? 'is-next' : ''} onClick={() => sequenceAction(i)} aria-label={`${label}, клавиша ${i + 1}`}><span>0{i + 1}</span><Icon name={ICONS[i]} size={27} /><b>{label}</b></button>)}</div><span className="ct-control-hint">{sequence.length} ударов · порядок подтверждает пульт</span></>}
      {event.kind === 'feedback' && <><div className="ct-channels">{CHANNELS.map((label, i) => { const muted = progress.muted?.includes(i); const overload = i === event.channel; return <button key={label} disabled={disabled || pending || (muted && !releaseReady)} onClick={() => channelAction(i)} className={`${overload && !muted ? 'ct-overload' : ''} ${muted ? 'is-muted' : ''} ${upgrades.includes('marks') && overload ? 'ct-marked' : ''}`} aria-label={`${label}${overload && !muted ? ', перегрузка' : ', сигнал в норме'}. ${muted ? releaseReady ? 'Вернуть канал' : 'Подожди, пока уйдёт свист' : 'Приглушить канал'}. Клавиша ${i + 1}`}><div className="ct-channel-leds" aria-hidden="true">{Array.from({ length: 7 }, (_, n) => <i key={n} className={!muted && (overload || n < 4) ? 'lit' : ''} />)}</div><b>{label}</b><span>{muted ? releaseReady ? 'ВЕРНУТЬ' : `ЖДИ ${releaseWait.toFixed(1)} c` : 'MUTE'}</span>{overload && <small>{muted ? 'СВИСТ УШЁЛ' : 'ПЕРЕГРУЗ'}</small>}</button> })}</div><span className="ct-control-hint" role="status">{returning ? releaseReady ? 'Сигнал чистый. Верни канал в зал.' : 'Дай сигналу успокоиться…' : <><i className="ct-warning-dot" />Красный — перегруз. Приглуши только этот канал.</>}</span></>}
      {event.kind === 'artist' && command && <><div className="ct-artist-quote"><Icon name="mic" size={22} /><span>{command[2]}</span></div><button className={`ct-command ${returning ? 'is-active' : ''}`} disabled={disabled || pending || (returning && !releaseReady)} onClick={() => act(commandId, () => audio?.set(commandId.startsWith('voice') ? 'voice' : 'loop', commandId.endsWith('on')))}><Icon name={commandId.startsWith('loop') ? 'cloud' : 'mic'} size={32} /><strong>{returning && !releaseReady ? event.request === 'loop-on' ? 'ПРИПЕВ В ПЕТЛЕ…' : 'ЗАЛ ПОЁТ…' : command[1]}</strong><span>{pending ? 'Команда в гарнитуре…' : returning ? releaseReady ? 'Два удара прошли. Возвращай звук!' : `Ещё ${releaseWait.toFixed(1)} с — держи этот момент` : 'Нажми, чтобы исполнить команду'}</span></button><span className="ct-control-sr" role="status">{returning ? releaseReady ? 'Пора вернуть звук.' : 'Команда выполнена. Подожди два удара.' : 'Ждём твою команду.'}</span></>}
      {event.kind === 'patch' && <><Pattern sequence={sequence} step={step} labels={['1', '2', '3', '4']} /><div className="ct-patchbay"><div className="ct-patch-inputs" aria-hidden="true">{sequence.map((_, i) => <span key={i} className={i < step ? 'is-done' : i === step ? 'is-next' : ''}>IN {i + 1}<i /></span>)}</div><svg className="ct-cables" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">{sequence.slice(0, step).map((n, i) => <path key={i} d={`M ${(i + .5) / sequence.length * 100} 0 C ${(i + .5) / sequence.length * 100} 30 ${(n + .5) * 25} 4 ${(n + .5) * 25} 34`} />)}</svg><div className="ct-patch-outputs">{[0, 1, 2, 3].map(i => <button key={i} disabled={disabled || pending} onClick={() => sequenceAction(i)} aria-label={`Подключить вход ${Math.min(step + 1, sequence.length)} к выходу ${i + 1}. Клавиша ${i + 1}`}><i /><b>OUT {i + 1}</b></button>)}</div></div><span className="ct-control-hint">{step < sequence.length ? `Вход ${step + 1} → выбери нужный выход` : 'Цепь подключена'}</span></>}
      {event.kind === 'blackout' && <><div className="ct-blackout-status" role="status"><i />{revealing ? `ЗАПОМНИ · ${Math.max(0, (event.reveal_ms || 1200) / 1000 - time).toFixed(1)} c` : 'СВЕТ ВЫКЛЮЧЕН · ПОВТОРИ'}</div><Pattern sequence={sequence} step={step} labels={['A', 'B', 'C', 'D']} hidden={!revealing} /><div className="ct-memory-pads">{['A', 'B', 'C', 'D'].map((letter, i) => <button key={letter} disabled={disabled || pending || revealing} onClick={() => sequenceAction(i)} aria-label={`Лампа ${letter}, клавиша ${i + 1}`}><i /><b>{letter}</b><small>0{i + 1}</small></button>)}</div><span className="ct-control-hint">{revealing ? 'Смотри на порядок. Лампы скоро погаснут.' : `По памяти · подтверждено ${step} из ${sequence.length}`}</span></>}
      {event.kind === 'power' && <><Pattern sequence={sequence} step={step} labels={['СЕТЬ', 'ПУЛЬТ', 'СЦЕНА', 'УСИЛ.']} /><div className="ct-power-rack">{['СЕТЬ', 'ПУЛЬТ', 'СЦЕНА', 'УСИЛИТЕЛЬ'].map((label, i) => { const on = sequence.slice(0, step).includes(i); return <button key={label} className={on ? 'is-on' : ''} disabled={disabled || pending || on} onClick={() => sequenceAction(i)} aria-pressed={on} aria-label={`${label}. ${on ? 'Питание включено' : 'Включить питание'}. Клавиша ${i + 1}`}><span>0{i + 1}<i /></span><em><b /></em><strong>{label}</strong><small>{on ? 'ON' : 'OFF'}</small></button> })}</div><span className="ct-control-hint">Соблюдай порядок переключений на схеме.</span></>}
    </div>
    <div className="ct-cue-progress" aria-hidden="true"><i style={{ width: `${clampControl(remaining / event.duration * 100)}%` }} /></div>
  </section>
}

export default function Controls(props) {
  return <SceneControls key={props.event.id} {...props} />
}
