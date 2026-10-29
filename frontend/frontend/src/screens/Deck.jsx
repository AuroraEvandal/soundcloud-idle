import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { getDeck, getShop, openPack } from '../api'
import { errorInfo } from '../errors'
import { bonusText } from '../bonus'
import { SLOTS, RARITY } from '../constants'
import AppBar from '../components/AppBar'
import Tabs from '../components/Tabs'
import Icon from '../components/Icon'
import CardView from '../components/CardView'
import ErrorBox from '../components/ErrorBox'
import { clothingDisplayName } from '../displayNames'

export default function Deck({ onClose }) {
  const [tab, setTab] = useState('deck')
  return (
    <div className="app">
      <AppBar title="Колода" onBack={onClose} />
      <Tabs
        tabs={[
          ['deck', 'Колода'],
          ['packs', 'Паки'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="app-body">{tab === 'deck' ? <DeckList /> : <Packs />}</div>
    </div>
  )
}

function DeckList() {
  const [cards, setCards] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getDeck()
      .then((r) => setCards(r.cards))
      .catch((e) => setError(errorInfo(e)))
  }, [])
  if (error) return <div className="pad"><ErrorBox message={error.message} /></div>
  if (!cards) return <div className="pad muted">Загрузка…</div>
  return (
    <div className="pad scroll">
      <div className="muted small-t">Карточек: {cards.length}</div>
      {SLOTS.map(([s, label]) => (
        <div key={s}>
          <div className="section">
            {label} · {cards.filter((c) => c.slot === s).length}
          </div>
          {cards
            .filter((c) => c.slot === s)
            .map((c) => (
              <CardView key={c.id} card={c} compact />
            ))}
        </div>
      ))}
    </div>
  )
}

const CELL = 96
const GAP = 8
const FINAL = 30
const FILL = ['common', 'common', 'common', 'rare', 'common', 'epic', 'common', 'rare']

function dropView(drop) {
  return drop.type === 'card'
    ? { label: drop.card.text, rarity: drop.card.rarity }
    : { label: clothingDisplayName(drop.item), rarity: drop.item.rarity }
}

function Packs() {
  const { player, setPlayer } = useGame()
  const [packs, setPacks] = useState([])
  const [error, setError] = useState(null)
  const [spin, setSpin] = useState(false)
  const [opening, setOpening] = useState(false)
  const [go, setGo] = useState(false)
  const [drop, setDrop] = useState(null)
  const [result, setResult] = useState(null)
  const box = useRef(null)
  const openingRef = useRef(false)
  const pack = packs[0]

  useEffect(() => {
    getShop()
      .then((r) => setPacks(r.packs))
      .catch((e) => setError(errorInfo(e)))
  }, [])

  async function open() {
    if (openingRef.current || spin || !pack) return
    openingRef.current = true
    setOpening(true)
    setError(null)
    setResult(null)
    try {
      const r = await openPack(pack.id)
      setPlayer(r.player)
      setDrop(r.drop)
      setSpin(true)
      setGo(false)
      requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
      setTimeout(() => {
        setSpin(false)
        setResult(r.drop)
      }, 3400)
    } catch (e) {
      setError(errorInfo(e))
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }

  const cells = Array.from({ length: 36 }, (_, i) =>
    i === FINAL && drop ? dropView(drop) : { label: '?', rarity: FILL[i % FILL.length] },
  )
  const width = box.current?.clientWidth || 360
  const shift = FINAL * (CELL + GAP) + CELL / 2 - width / 2

  return (
    <div className="packs">
      <ErrorBox message={error?.message} onHome={() => setError(null)} />
      {spin ? (
        <div className="roulette" ref={box} aria-label="Открываем пак">
          <div
            className="roulette-strip"
            style={{ transform: `translateX(${go ? -shift : 0}px)`, transition: go ? 'transform 3.1s cubic-bezier(0.1, 0.7, 0.2, 1)' : 'none' }}
          >
            {cells.map((c, i) => (
              <div className={`roulette-item rarity-${c.rarity}`} key={i}>
                {c.label}
              </div>
            ))}
          </div>
          <div className="roulette-mark" />
        </div>
      ) : (
        <div className="lootbox">
          <Icon name="box" size={96} color="#a0a0a0" stroke={1.4} />
          <span className="lootbox-q">?</span>
        </div>
      )}
      {result && (
        <div className="drop">
          <div className="muted small-t">Выпало</div>
          {result.type === 'card' ? (
            <CardView card={result.card} compact />
          ) : (
            <div className={`row bar rarity-row rarity-${result.item.rarity}`}>
              {result.item.thumb && <img className="thumb" src={result.item.thumb} alt="" />}
              <div className="row-main">
                {clothingDisplayName(result.item)}
                <div className="muted small-t">
                  Одежда · {RARITY[result.item.rarity]} · {bonusText(result.item.bonus)}
                </div>
              </div>
            </div>
          )}
          {result.duplicate && <div className="muted small-t">Такая карточка уже была: +₽{result.refund}</div>}
        </div>
      )}
      <button className="btn wide" onClick={open} disabled={opening || spin || !pack || (player?.coins ?? 0) < (pack?.price ?? 0)}>
        {opening ? 'ОТКРЫВАЕМ…' : `ОТКРЫТЬ ПАК${pack ? ` · ₽${pack.price}` : ''}`}
      </button>
      {pack && (player?.coins ?? 0) < pack.price && <div className="muted small-t">Не хватает монет</div>}
    </div>
  )
}
