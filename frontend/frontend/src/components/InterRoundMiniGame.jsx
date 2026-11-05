import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { startMiniGame, finishMiniGame } from '../api'
import { errorInfo } from '../errors'
import { timingPosition, miniGameClockOffset } from '../timingGame'
import './InterRoundMiniGame.css'

const COPY = {
  timing: {
    title: 'Рэп-тайминг', label: 'ПОПАДИ В БИТ', button: 'УДАРИТЬ', penalty: 15,
    help: 'Три точных тапа подряд. Лови белый маркер в центральной зоне: вперёд, назад, затем хаос.',
    failure: 'Мимо! Штрафные баллы!',
  },
  slang: {
    title: 'Сленг-чек', label: 'НЕ ЗАБУДЬ ТЕКСТ', penalty: 20,
    help: 'За 2 секунды выбери подходящее окончание строки. Одна попытка.',
    failure: 'Забыл текст на**й!',
  },
  wave: {
    title: 'Удержи волну', label: 'ПОЙМАЙ ПИК', button: 'КАЧАТЬ!', penalty: 15,
    help: 'Тапни, когда белый маркер окажется в зоне пика. Два пика, один тап.',
    failure: 'Микрофон фонит! Сбился с волны.',
  },
}

export default function InterRoundMiniGame({ battleId, roundNumber, onComplete, onRecover }) {
  const [game, setGame] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(0)
  const [started, setStarted] = useState(false)
  const mounted = useRef(false)
  const sending = useRef(false)
  const submitted = useRef(false)
  const continued = useRef(false)
  const retry = useRef(null)
  const clockOffset = useRef(0)
  const panel = useRef(null)
  const reducedMotion = useReducedMotion()
  const progress = useMotionValue(0)
  const amplitude = useMotionValue(0)
  const position = useMotionValue(0)
  const cursor = useTransform(position, (value) => `${value * 100}%`)
  const marker = useTransform(amplitude, (value) => `${(1 - value) * 100}%`)
  const pulse = useTransform(amplitude, (value) => .25 + value * .75)
  const remaining = useTransform(progress, (value) => 1 - value)

  const request = useCallback(async (operation) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    retry.current = operation
    const sent = performance.now()
    try {
      const response = await operation()
      if (!mounted.current) return
      // Estimate transit only; Edge/auth/SQL processing must not advance the cursor.
      clockOffset.current = miniGameClockOffset(response, sent, performance.now())
      submitted.current = false
      setGame(response)
    } catch (e) {
      if (mounted.current) setError(errorInfo(e))
    } finally {
      sending.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    panel.current?.focus()
    request(() => startMiniGame(battleId, roundNumber))
    return () => { mounted.current = false }
  }, [battleId, roundNumber, request])

  const finish = useCallback((actionId) => {
    if (!game || game.penalty_points !== null || submitted.current || sending.current) return
    if (actionId === 'tap' && performance.now() + clockOffset.current < game.started_at) return
    submitted.current = true
    const action = game.kind === 'timing' ? `${actionId}-${(game.timing_hits ?? 0) + 1}` : actionId
    request(() => finishMiniGame(battleId, game.id, action))
  }, [battleId, game, request])

  useEffect(() => {
    if (!game?.started_at || game.penalty_points !== null || submitted.current) return
    let frame
    const tick = () => {
      if (submitted.current) return
      const elapsed = performance.now() + clockOffset.current - game.started_at
      const fraction = Math.max(0, Math.min(1, elapsed / game.duration_ms))
      progress.set(fraction)
      position.set(timingPosition(elapsed, game.timing_hits ?? 0, game.timing_path))
      amplitude.set(Math.sin(Math.max(0, elapsed) * Math.PI / 1600) ** 2)
      setTime(Math.max(0, Math.ceil((game.duration_ms - Math.max(0, elapsed)) / 100) / 10))
      setStarted(elapsed >= 0)
      if (elapsed >= game.duration_ms) finish('timeout')
      else frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [game, finish, progress, amplitude, position])

  const copy = COPY[game?.kind]
  const complete = game?.penalty_points != null
  const failed = complete && game.penalty_points > 0
  const playing = started && !complete && !busy && !error && !submitted.current

  function next() {
    if (!complete || continued.current) return
    continued.current = true
    onComplete(game.penalty_points)
  }

  return (
    <motion.section ref={panel} tabIndex={-1} className={`mini-game ${game?.kind === 'timing' ? 'mini-rhythm' : ''} ${failed ? 'mini-failed' : ''}`}
      aria-label={`Концентрация перед раундом ${roundNumber}`}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0, x: failed && !reducedMotion ? [0, -5, 5, -3, 3, 0] : 0 }}
      transition={{ duration: .3 }}>
      <div className="mini-eyebrow">КОНЦЕНТРАЦИЯ / {roundNumber - 1} → {roundNumber}</div>
      <div className="mini-heading"><h2>{copy?.title || 'Лови ритм'}</h2><span>SW / LIVE</span></div>
      {!game && !error && <p role="status">Готовим следующую проверку…</p>}
      {copy && <>
        <p className="mini-help">{copy.help}</p>
        <div className="mini-stakes">Успех: без штрафа <span>Промах: −{copy.penalty} очков</span></div>
        {game.kind === 'timing' && <>
          <div className="rhythm-steps" aria-label={`Точных попаданий: ${game.timing_hits ?? 0} из 3`}>
            {['ВПЕРЁД', 'НАЗАД', 'ХАОС'].map((label, i) => <div key={label}
              className={`${i < (game.timing_hits ?? 0) ? 'is-hit' : ''} ${i === (game.timing_hits ?? 0) && !complete ? 'is-current' : ''}`}>
              <b>{i < (game.timing_hits ?? 0) ? '✓' : ['→', '←', '↯'][i]}</b><span>0{i + 1} / {label}</span>
            </div>)}
          </div>
          <div className="rhythm-deck" aria-hidden="true">
            <div className="rhythm-deck-label"><span>SYNC ENGINE</span><b>{String(Math.min(3, (game.timing_hits ?? 0) + 1)).padStart(2, '0')} / 03</b></div>
            <div className="rhythm-field">
              <div className="rhythm-grid">{Array.from({ length: 31 }, (_, i) => <i key={i} style={{ height: `${18 + ((i * 19 + 7) % 60)}%` }} />)}</div>
              <div className="rhythm-target"><i /><span>HIT</span><i /></div>
              <div className="rhythm-axis" />
              <motion.div className="rhythm-playhead" style={{ left: game.started_at ? cursor : '0%' }}><i /><b /><i /></motion.div>
            </div>
            <div className="rhythm-ruler"><span>− OFF BEAT</span><span>ON BEAT</span><span>OFF BEAT +</span></div>
          </div>
          <div className="rhythm-feedback" role="status">{complete ? `${game.timing_hits ?? 0} / 3 ПОПАДАНИЙ` : busy && submitted.current
            ? 'ПРОВЕРЯЕМ ТАП…' : !game.started_at ? 'ТРИ ЭТАПА. ОДНА ПОПЫТКА.' : !started ? 'ПРИГОТОВЬСЯ К СЛЕДУЮЩЕМУ УДАРУ' : ['ЛОВИ РИТМ →', 'ОБРАТНЫЙ ХОД ←', 'НЕ ПРЕДУГАДЫВАЙ. ЛОВИ МОМЕНТ.'][game.timing_hits ?? 0]}</div>
        </>}
        {game.started_at && <>
          <div className="mini-clock"><span>{complete ? 'ПРОВЕРКА ЗАВЕРШЕНА' : !started ? 'ГОТОВЬСЯ…' : copy.label}</span>
            <b aria-label="Осталось секунд">{time.toFixed(1)}s</b></div>
          {game.kind === 'slang' && <>
            <div className="mini-timer-track" aria-hidden="true"><motion.div style={{ scaleX: remaining }} /></div>
            <div className="mini-prompt">{started ? game.prompt : 'Сейчас появится строка…'}</div>
            <div className="mini-options">{started && game.options.map((option, i) =>
              <motion.button key={option.id} type="button" disabled={!playing} onClick={() => finish(option.id)}
                initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: .12 }}><span>0{i + 1}</span>{option.text}</motion.button>)}</div>
          </>}
          {game.kind === 'wave' && <div className="mini-wave" aria-hidden="true">
            <div className="mini-peak-zone"><span>ПИК</span></div>
            <div className="mini-wave-bars">{Array.from({ length: 29 }, (_, i) =>
              <motion.i key={i} style={{ height: `${24 + (1 - Math.abs(i - 14) / 15) * 76}%`, scaleY: pulse }} />)}</div>
            <div className="mini-amplitude"><motion.i style={{ top: marker }} /></div>
          </div>}
          {game.kind !== 'slang' && !complete &&
            <button type="button" className="btn mini-action" disabled={!playing} onClick={() => finish('tap')}>{copy.button}{game.kind === 'timing' ? ` · ${Math.min(3, (game.timing_hits ?? 0) + 1)}/3` : ''}</button>}
        </>}
        {!game.started_at && !complete && <button type="button" className="btn mini-action" disabled={busy || !!error}
          onClick={() => request(() => startMiniGame(battleId, roundNumber, 'start'))}>НАЧАТЬ</button>}
      </>}
      {busy && game && <p className="mini-status" role="status">{submitted.current ? 'Фиксируем результат…' : 'Подключаемся…'}</p>}
      {error && <div className="mini-error" role="alert"><p>{error.message}</p>
        <button type="button" className="btn mini-action" disabled={busy}
          onClick={() => error.action !== 'retry' && onRecover ? onRecover(error) : request(retry.current)}>
          {error.action !== 'retry' && onRecover ? 'ВОССТАНОВИТЬ БАТТЛ' : 'ПОВТОРИТЬ ЗАПРОС'}</button>
      </div>}
      {complete && <motion.div className="mini-outcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status">
        <strong>{failed ? copy.failure : 'Чисто. Продолжаем!'}</strong>
        <p>{failed ? `−${game.penalty_points} очков в раунде ${roundNumber}` : 'Без штрафа. Бонусов нет.'}</p>
        <button type="button" className="btn mini-action" onClick={next}>К РАУНДУ {roundNumber}</button>
      </motion.div>}
      <div className="mini-footer">{game?.kind === 'timing' ? '3 ПОПАДАНИЯ ПОДРЯД' : 'ОДНА ПОПЫТКА'} · БЕЗ БОНУСОВ</div>
    </motion.section>
  )
}
