import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { getShop, getWardrobe, buyItem, equipItem } from '../api'
import { errorInfo } from '../errors'
import { bonusText } from '../bonus'
import { RARITY } from '../constants'
import AppBar from '../components/AppBar'
import Tabs from '../components/Tabs'
import Icon from '../components/Icon'
import CharacterModel from '../components/CharacterModel'
import ErrorBox from '../components/ErrorBox'
import { clothingDisplayName } from '../displayNames'

const SLOTS = [
  ['hat', 'Шапка', 'hat'],
  ['hoodie', 'Худи', 'hoodie'],
  ['pants', 'Штаны', 'pants'],
  ['shoe', 'Обувь', 'shoe'],
  ['chain', 'Цепь', 'chain'],
]

function ItemRow({ item, children }) {
  return (
    <div className={`row bar rarity-row rarity-${item.rarity}`}>
      {item.thumb && <img className="thumb" src={item.thumb} alt="" />}
      <div className="row-main">
        {clothingDisplayName(item)}
        <div className="muted small-t">
          {RARITY[item.rarity]} · {bonusText(item.bonus)}
        </div>
        {item.description && <div className="muted small-t">{item.description}</div>}
      </div>
      {children}
    </div>
  )
}

export default function Store({ onClose }) {
  const { nick, player, setPlayer } = useGame()
  const [tab, setTab] = useState('wardrobe')
  const [wardrobe, setWardrobe] = useState(null)
  const [shop, setShop] = useState(null)
  const [slot, setSlot] = useState('hat')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const [w, s] = await Promise.all([getWardrobe(), getShop()])
      setWardrobe(w)
      setShop(s)
      setPlayer(s.player)
    } catch (e) {
      setError(errorInfo(e))
    }
  }, [setPlayer])

  useEffect(() => {
    load()
  }, [load])

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

  const equip = (s, id) =>
    act(async () => {
      const r = await equipItem(s, id)
      setWardrobe((w) => ({ ...w, outfit: r.outfit, bonuses: r.bonuses }))
    })

  const buy = (id) =>
    act(async () => {
      const r = await buyItem('clothing', id)
      setPlayer(r.player)
      await load()
    })

  const byId = (id) => wardrobe?.items.find((i) => i.id === id)
  const owned = (wardrobe?.items || []).filter((i) => i.slot === slot)

  return (
    <div className="app">
      <AppBar title="Магазин" onBack={onClose} />
      <Tabs
        tabs={[
          ['wardrobe', 'Гардероб'],
          ['catalog', 'Магазин'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="app-body scroll pad">
        <ErrorBox message={error?.message} onRetry={error?.action === 'retry' ? load : null} onHome={() => setError(null)} />
        {!wardrobe && !error && <div className="muted">Загрузка…</div>}

        {wardrobe && tab === 'wardrobe' && (
          <div className="wardrobe">
            <div className="mannequin" aria-label={`Манекен ${nick}`}>
              <CharacterModel
                look={Object.fromEntries(
                  Object.entries(wardrobe.outfit).map(([s, id]) => [s, byId(id)?.image]),
                )}
              />
            </div>
            <div className="eq-grid">
              {SLOTS.map(([s, label, icon]) => {
                const it = byId(wardrobe.outfit[s])
                return (
                  <button key={s} className={'eq' + (slot === s ? ' active' : '') + (it ? ' filled' : '')} onClick={() => setSlot(s)}>
                    {it?.thumb ? <img className="eq-thumb" src={it.thumb} alt="" /> : <Icon name={icon} size={30} color="#a0a0a0" />}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
            <div className="muted small-t center">
              Бонусы: доход +{wardrobe.bonuses.income_pct}% · популярность +{wardrobe.bonuses.popularity_pct}% · харизма +{wardrobe.bonuses.charisma}
            </div>
            <div className="list wide-list">
              {owned.length === 0 && <div className="empty">Для этого слота вещей нет. Купи в магазине или выбей из пака</div>}
              {owned.map((it) => {
                const on = wardrobe.outfit[slot] === it.id
                return (
                  <ItemRow key={it.id} item={it}>
                    <button className="btn small" disabled={busy} onClick={() => equip(slot, on ? null : it.id)}>
                      {on ? 'СНЯТЬ' : 'НАДЕТЬ'}
                    </button>
                  </ItemRow>
                )
              })}
            </div>
          </div>
        )}

        {shop && tab === 'catalog' && (
          <div className="list">
            {shop.clothing.map((it) => (
              <ItemRow key={it.id} item={it}>
                {it.owned ? (
                  <span className="muted small-t">КУПЛЕНО</span>
                ) : (
                  <>
                    <span className="price">₽{it.price}</span>
                    <button className="btn small" disabled={busy || (player?.coins ?? 0) < it.price} onClick={() => buy(it.id)}>
                      КУПИТЬ
                    </button>
                  </>
                )}
              </ItemRow>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
