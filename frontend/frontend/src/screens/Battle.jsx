import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { startBattle, submitRound, getHand, getWardrobe } from '../api'
import { SLOTS, CRITERIA } from '../constants'
import { errorInfo } from '../errors'
import { readBattleId, saveBattleId, clearBattleId } from '../storage'
import Arena from '../components/Arena'
import CardView from '../components/CardView'
import ErrorBox from '../components/ErrorBox'
import Icon from '../components/Icon'

const EMPTY = { setup: null, development: null, boost: null, punch: null }

// Слот -> путь к PNG-слою. Игрок: из гардероба (надетое). Соперник: из ответа start-battle.
const playerLook = (w) =>
  Object.fromEntries(
    Object.entries(w?.outfit || {})
      .map(([slot, id]) => [slot, w.items.find((i) => i.id === id)?.image])
      .filter(([, img]) => img),
  )
const opponentLook = (outfit) =>
  Object.fromEntries(
    Object.entries(outfit || {})
      .filter(([, it]) => it?.image)
      .map(([slot, it]) => [slot, it.image]),
  )
const fmt1 = (n) => Number(n).toFixed(1)

function Lines({ title, side }) {
  return (
    <div className="res-side">
      <div className="res-title">{title}</div>
      <div className="res-lines">
        {side.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="res-scores">
        {CRITERIA.map(([k, label]) => (
          <div key={k} className="res-score">
            <span>{label}</span>
            <b>{fmt1(side.scores[k])}</b>
          </div>
        ))}
      </div>
      <div className="res-points">{side.points} очков</div>
    </div>
  )
}

export default function Battle() {
  const { nick, player, profile, refreshProfile, relogin } = useGame()
  // list | build | judging | result | final
  const [phase, setPhase] = useState('list')
  const [battle, setBattle] = useState(null)
  const [round, setRound] = useState(null)
  const [hand, setHand] = useState(null)
  const [picks, setPicks] = useState(EMPTY)
  const [active, setActive] = useState('setup')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [note, setNote] = useState('')
  const [look, setLook] = useState({})
  const busyRef = useRef(false)

  async function restoreBattle(id) {
    setRestoring(true)
    setError(null)
    try {
      const state = await getHand(id)
      // Не подменяем состояние, если игрок уже успел начать другой батл.
      if (readBattleId() !== id) return
      if (!state.battle) {
        clearBattleId()
        setNote('Незавершённый батл не удалось восстановить. Начни новый')
        return
      }
      setBattle(state.battle)
      setHand(state.cards)
      setLook({})
      if (state.last_result) {
        setRound(state.last_result.round)
        setResult(state.last_result)
        setPhase('result')
      } else {
        setRound(state.round)
        setResult(null)
        setPhase('build')
      }
    } catch (e) {
      if (readBattleId() !== id) return
      const info = errorInfo(e)
      if (info.code === 'BATTLE_NOT_FOUND') {
        clearBattleId()
        setNote('Незавершённый батл не найден. Начни новый')
      } else {
        setError({ ...info, retry: () => restoreBattle(id) })
      }
    } finally {
      setRestoring(false)
    }
  }

  useEffect(() => {
    const id = readBattleId()
    if (id) restoreBattle(id)
    // Восстановление запускается один раз при создании экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unlocked = (profile?.opponents || []).filter((o) => o.unlocked).length

  function toList() {
    clearBattleId()
    setPhase('list')
    setBattle(null)
    setResult(null)
    setError(null)
    refreshProfile().catch(() => {})
  }

  function fail(err, retry, extra) {
    const info = errorInfo(err, extra)
    if (info.action === 'relogin') {
      relogin()
      return
    }
    setError({ ...info, retry: info.action === 'retry' ? retry : null })
    if (info.action === 'resync' && battle) {
      const resync = async () => {
        try {
          const r = await getHand(battle.id)
          if (r.battle) setBattle(r.battle)
          if (r.last_result) {
            setRound(r.last_result.round)
            setResult(r.last_result)
            setHand(r.cards)
            setPhase('result')
            setError(null)
            return
          }
          setRound(r.round)
          setHand(r.cards)
          setPicks(EMPTY)
          setError(null)
        } catch (e) {
          const recoveryError = errorInfo(e)
          setError({ ...recoveryError, retry: resync })
        }
      }
      resync()
    }
  }

  async function begin(opp) {
    if (busyRef.current) return
    if (!opp.unlocked) {
      fail({ code: 'OPPONENT_LOCKED' }, null, { required: opp.required_popularity })
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    setNote('')
    try {
      // Одежда на бойце: берём то, что надето в гардеробе прямо сейчас. Если не загрузилась, рисуем без неё.
      const [r, w] = await Promise.all([startBattle(opp.id), getWardrobe().catch(() => null)])
      setLook(playerLook(w))
      saveBattleId(r.battle.id)
      setBattle(r.battle)
      setRound(r.round)
      setHand(r.hand)
      setPicks(EMPTY)
      setActive('setup')
      setResult(null)
      if (r.last_result) {
        setRound(r.last_result.round)
        setResult(r.last_result)
        setPhase('result')
      } else {
        setPhase('build')
      }
    } catch (e) {
      fail(e, () => begin(opp), { required: opp.required_popularity })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function pick(slot, card) {
    setPicks((p) => ({ ...p, [slot]: p[slot]?.id === card.id ? null : card }))
    // автопереход к следующему пустому слоту
    const idx = SLOTS.findIndex(([s]) => s === slot)
    const next = SLOTS.slice(idx + 1).find(([s]) => !picks[s])
    if (next && picks[slot]?.id !== card.id) setActive(next[0])
  }

  const full = SLOTS.every(([s]) => picks[s])

  async function send() {
    if (!full || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setPhase('judging')
    try {
      const ids = SLOTS.map(([s]) => picks[s].id) // строго по порядку слотов
      const r = await submitRound(battle.id, round.number, ids)
      setResult(r)
      setPhase('result')
    } catch (e) {
      setPhase('build')
      fail(e, send)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function next() {
    setBattle((b) => ({ ...b, ...result.battle }))
    if (result.next_round) {
      setRound(result.next_round)
      setHand(result.hand)
      setPicks(EMPTY)
      setActive('setup')
      setResult(null)
      setPhase('build')
    } else {
      clearBattleId()
      setPhase('final')
      refreshProfile().catch(() => {})
    }
  }

  // ---------- Выбор соперника ----------
  if (phase === 'list') {
    return (
      <div className="pad scroll">
        <h2 className="h2">Выбери соперника</h2>
        <div className="muted small-t">
          Открыто: {unlocked} из {profile?.opponents?.length || 0}
        </div>
        {note && <div className="note">{note}</div>}
        {restoring && <div className="note">Восстанавливаю незавершённый батл…</div>}
        <ErrorBox message={error?.message} onRetry={error?.retry} onHome={() => setError(null)} />
        <div className="list">
          {(profile?.opponents || []).map((o) => (
            <button
              key={o.id}
              className={'opp' + (o.unlocked ? '' : ' locked')}
              onClick={() => begin(o)}
              disabled={busy || restoring}
            >
              <div className="opp-lvl">{o.level}</div>
              <div className="opp-main">
                <div className="opp-name">{o.name}</div>
                <div className="muted small-t">{o.location}</div>
              </div>
              {o.unlocked ? (
                <span className="btn small">В БОЙ</span>
              ) : (
                <span className="opp-lock">
                  <Icon name="lock" size={18} />
                  <span>{o.required_popularity}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ---------- Сам батл ----------
  const lastWinner = result?.round?.winner
  const finalWin = result?.battle?.result === 'win'
  const pState = phase === 'result' || phase === 'final' ? (lastWinner === 'opponent' || (phase === 'final' && !finalWin) ? 'hit' : 'win') : ''
  const oState = phase === 'result' || phase === 'final' ? (lastWinner === 'player' || (phase === 'final' && finalWin) ? 'hit' : 'win') : ''
  const shake = phase === 'result' && lastWinner && lastWinner !== 'draw'

  const sb = phase === 'result' || phase === 'final' ? result?.battle : battle
  const score = { p: sb?.player_rounds_won ?? 0, o: sb?.opponent_rounds_won ?? 0 }

  return (
    <div className="battle">
      <Arena
        playerName={nick}
        opponentName={battle?.opponent?.name}
        playerLook={look}
        opponentLook={opponentLook(battle?.opponent?.outfit)}
        playerState={pState}
        opponentState={oState}
        shake={shake}
        key={phase === 'result' ? 'r' + result?.round?.number : 'a'}
      />
      <div className="controls">
        <div className="bar-info">
          <span>
            Раунд {round?.number ?? result?.round?.number}/3 · «{round?.theme ?? result?.round?.theme}»
          </span>
          <span className="score">
            {score.p} : {score.o}
          </span>
        </div>

        {(phase === 'build' || phase === 'judging') && (
          <>
            <div className="slots">
              {SLOTS.map(([s, label]) => (
                <button
                  key={s}
                  className={'slot' + (active === s ? ' active' : '') + (picks[s] ? ' filled' : '')}
                  onClick={() => setActive(s)}
                  disabled={phase === 'judging'}
                >
                  <span className="slot-label">{label}</span>
                  <span className="slot-text">{picks[s] ? picks[s].text : '—'}</span>
                </button>
              ))}
            </div>
            <ErrorBox
              message={error?.message}
              onRetry={error?.retry}
              onHome={error?.action === 'home' ? toList : () => setError(null)}
              retryLabel="Повторить"
            />
            {phase === 'judging' ? (
              <div className="judging">
                <div className="loader" />
                <div>Судья думает…</div>
              </div>
            ) : (
              <div className="hand scroll">
                {(hand?.[active] || []).map((c) => (
                  <CardView key={c.id} card={c} selected={picks[active]?.id === c.id} onClick={() => pick(active, c)} />
                ))}
              </div>
            )}
            <button className="btn cta" onClick={send} disabled={!full || busy || phase === 'judging'}>
              ЗАЧИТАТЬ
            </button>
          </>
        )}

        {phase === 'result' && result && (
          <div className="result scroll">
            <div className={'verdict ' + result.round.winner}>
              {result.round.winner === 'player' && 'Раунд за тобой'}
              {result.round.winner === 'opponent' && 'Раунд за соперником'}
              {result.round.winner === 'draw' && 'Ничья в раунде'}
            </div>
            <Lines title={nick} side={result.round.player} />
            {result.round.player.comment && <div className="comment">Судья: {result.round.player.comment}</div>}
            <Lines title={battle?.opponent?.name} side={result.round.opponent} />
            <button className="btn cta" onClick={next}>
              {result.next_round ? 'СЛЕДУЮЩИЙ РАУНД' : 'ИТОГИ БАТЛА'}
            </button>
          </div>
        )}

        {phase === 'final' && result && (
          <div className="result final">
            <div className={'verdict big ' + (finalWin ? 'player' : 'opponent')}>{finalWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div>
            <div className="muted">
              Счёт по раундам {result.battle.player_rounds_won} : {result.battle.opponent_rounds_won}
            </div>
            <div className="rewards">
              <div>
                <b>{result.rewards.xp_change > 0 ? '+' : ''}{result.rewards.xp_change}</b>
                <span>опыта</span>
              </div>
              <div>
                <b>{result.rewards.popularity_change > 0 ? '+' : ''}{result.rewards.popularity_change}</b>
                <span>популярности</span>
              </div>
            </div>
            {result.rewards.level_up && <div className="levelup">Новый уровень: {result.rewards.new_level}</div>}
            <button className="btn cta" onClick={toList}>
              НА ГЛАВНУЮ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
