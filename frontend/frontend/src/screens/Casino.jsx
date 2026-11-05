import { useCallback, useEffect, useRef, useState } from 'react'
import AppBar from '../components/AppBar'
import ErrorBox from '../components/ErrorBox'
import { PetArt } from '../components/PetCompanion'
import { useGame } from '../GameContext'
import { getCases, openCase, createCaseInvoice, getCaseOrder } from '../api'
import { errorInfo } from '../errors'
import { CASE_ART } from '../caseCatalog'

function readOrder(playerId) {
  try { return JSON.parse(localStorage.getItem(`case-order:${playerId}`)) || null }
  catch { return null }
}

export default function Casino({ onClose }) {
  const { player, setPlayer, petCollection, setPetCollection } = useGame()
  const [cases, setCases] = useState(null)
  const [selected, setSelected] = useState('free')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drop, setDrop] = useState(null)
  const [order, setOrder] = useState(() => readOrder(player.id))
  const [checking, setChecking] = useState(false)
  const [pollVersion, setPollVersion] = useState(0)
  const [now, setNow] = useState(Date.now())
  const busyRef = useRef(false)
  const orderRef = useRef(order)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const load = useCallback(async () => {
    try {
      const result = await getCases()
      if (!mounted.current) return
      setCases(result.cases)
      setPetCollection(result.pets)
      setError(null)
    } catch (e) { if (mounted.current) setError(errorInfo(e)) }
  }, [setPetCollection])
  useEffect(() => { load() }, [load])

  const rememberOrder = useCallback((value) => {
    orderRef.current = value
    if (mounted.current) setOrder(value)
    try {
      if (value) localStorage.setItem(`case-order:${player.id}`, JSON.stringify(value))
      else localStorage.removeItem(`case-order:${player.id}`)
    } catch { /* Заказ остаётся в памяти, если браузер запрещает хранилище. */ }
  }, [player.id])

  const applyDrop = useCallback((result) => {
    setPlayer(result.player)
    setPetCollection(result.pets)
    setDrop(result.drop)
  }, [setPlayer, setPetCollection])

  // Ограниченная проверка; уход с экрана останавливает таймер. Callback Telegram ничего не выдаёт.
  useEffect(() => {
    if (!order?.order_id) return
    let cancelled = false
    let timer
    let attempts = 0
    setChecking(true)
    const check = async () => {
      try {
        const result = await getCaseOrder(order.order_id)
        if (cancelled) return
        if (result.status === 'paid') {
          applyDrop(result)
          rememberOrder(null)
          setChecking(false)
          setError(null)
          load()
          return
        }
        attempts += 1
        if (attempts < 30) timer = setTimeout(check, 2000)
        else setChecking(false)
      } catch (e) {
        if (!cancelled) { setError(errorInfo(e)); setChecking(false) }
      }
    }
    check()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [order?.order_id, pollVersion, applyDrop, load, rememberOrder])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  async function openSelected() {
    if (busyRef.current || (selected !== 'free' && orderRef.current)) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setDrop(null)
    try {
      if (selected === 'free') {
        const result = await openCase(selected)
        if (!mounted.current) return
        applyDrop(result)
        await load()
      } else {
        const telegram = window.Telegram?.WebApp
        if (!telegram?.openInvoice) {
          setError({ message: 'Для оплаты открой игру внутри Telegram' })
          return
        }
        const result = await createCaseInvoice(selected)
        // Сохраняем заказ до открытия Telegram: при перезагрузке продолжим проверку.
        rememberOrder(result)
        if (!mounted.current) return
        telegram.openInvoice(result.invoice_url, () => {
          if (mounted.current) setPollVersion((v) => v + 1)
        })
      }
    } catch (e) { if (mounted.current) setError(errorInfo(e)) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }

  const box = cases?.find((item) => item.id === selected)
  const art = CASE_ART[selected] || CASE_ART.free
  const waiting = box?.available_at && Date.parse(box.available_at) > now
  const dropPet = petCollection?.pets.find((pet) => pet.id === drop?.pet_id)

  return <div className="app casino">
    <AppBar title="Казик" onBack={onClose} />
    <div className="app-body scroll casino-body">
      <div className="casino-heading"><span>AFTER HOURS / PET COLLECTION</span><b>Кто будет<br />с тобой на сцене?</b><p>Питомцы, дружба и маленький бонус к доходу.</p></div>
      <ErrorBox message={error?.message} onRetry={load} onHome={() => setError(null)} />
      {!cases && !error && <p className="muted">Загрузка кейсов…</p>}
      {order && <div className="case-pending" role="status">
        <b>{checking ? 'Проверяем оплату на сервере…' : 'Заказ ожидает подтверждения оплаты'}</b>
        <p>Награда появится после подтверждения Telegram. Можно вернуться к оплате или отложить её.</p>
        <button className="btn small" disabled={checking} onClick={() => { setError(null); setPollVersion((v) => v + 1) }}>ПРОВЕРИТЬ ОПЛАТУ</button>
        {order.invoice_url && <button className="btn small" onClick={() => {
          try { window.Telegram?.WebApp?.openInvoice(order.invoice_url, () => { if (mounted.current) setPollVersion((v) => v + 1) }) }
          catch (e) { setError({ message: e.message || 'Не удалось открыть оплату' }) }
        }}>ОТКРЫТЬ СЧЁТ</button>}
        <button className="btn small" onClick={() => { rememberOrder(null); setChecking(false); setError(null) }}>ОТЛОЖИТЬ ОПЛАТУ</button>
        <p>Счёт сохранён на сервере; если оплатишь позже, награда сохранится.</p>
      </div>}
      <div className="case-tabs" role="group" aria-label="Выбор кейса">
        {cases?.map((item) => <button key={item.id} aria-pressed={item.id === selected} disabled={busy} onClick={() => { setSelected(item.id); setDrop(null) }}>
          <img src={(CASE_ART[item.id] || CASE_ART.free).image} alt="" /><span>{item.name}<small>{item.price_stars ? `${item.price_stars} ★` : 'Бесплатно'}</small></span>
        </button>)}
      </div>
      {box && <div className="case-preview" style={{ '--case-accent': art.accent }}>
        <div className="case-hero"><span className="case-kicker">КОЛЛЕКЦИЯ СПУТНИКОВ</span><div className="case-art"><img src={art.image} alt={`Кейс ${box.name}`} /></div><h2>{box.name}</h2><p>{art.subtitle}</p><div className="case-price">{box.price_stars ? `${box.price_stars} ★` : 'Бесплатно'}<small>{box.price_stars ? 'Telegram Stars' : 'Раз в 24 часа'}</small></div></div>
        <p className="case-help">Шанс питомца — {(box.pet_chance * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%. Все три питомца равновероятны. Если питомец не выпал — {box.fallback_coins} монет.</p>
        <div className="case-pets">{petCollection?.pets.map((pet) => <div key={pet.id}><PetArt pet={pet} /><span>{pet.name}</span></div>)}</div>
        {waiting && <p className="case-help">Доступно {new Date(box.available_at).toLocaleString('ru-RU')}</p>}
        <button className="case-open" disabled={busy || (box.price_stars > 0 && !!order) || waiting} onClick={openSelected}>{busy ? 'ОТКРЫВАЕМ…' : waiting ? 'КЕЙС ВОССТАНАВЛИВАЕТСЯ' : box.price_stars ? `ОПЛАТИТЬ ${box.price_stars} ★` : 'ОТКРЫТЬ БЕСПЛАТНО'} <span>↗</span></button>
        {drop && <div className="case-result" role="status" aria-live="polite">
          <small>ТВОЙ ДРОП</small>
          {drop.type === 'pet' ? <>{dropPet && <PetArt pet={dropPet} pose="happy" />}<strong>{dropPet?.name || drop.pet_id}</strong><span>{drop.duplicate ? 'Дубликат · ' : 'Новый спутник · '}Уровень {drop.level}{drop.refund > 0 ? ` · +${drop.refund} монет` : ''}</span></> : <strong>+{drop.coins} монет</strong>}
        </div>}
        <details className="case-rules"><summary>Уровни и дружба</summary><p>Первый дроп открывает питомца. Два дубликата повышают его до уровня 3, следующие дают 300 монет. Релизы и батлы укрепляют дружбу активного спутника.</p><p>Выбрать спутника можно в профиле. Оплата подтверждается сервером; закрытие окна Telegram не означает выдачу награды.</p></details>
      </div>}
    </div>
  </div>
}
