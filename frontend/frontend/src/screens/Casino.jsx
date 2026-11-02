import { useEffect, useState } from 'react'
import AppBar from '../components/AppBar'
import Icon from '../components/Icon'
import { CASES } from '../caseCatalog'

function CasePreview({ box }) {
  const [selection, setSelection] = useState(0)
  const [phase, setPhase] = useState('idle')
  const reward = box.rewards[selection]
  // shortcut: выбранный концепт вместо розыгрыша; заменить после появления серверной выдачи.
  const reel = Array.from({ length: 18 }, (_, i) => box.rewards[i === 15 ? selection : i % box.rewards.length])

  useEffect(() => {
    if (phase !== 'opening') return
    const timer = setTimeout(() => setPhase('result'), 2600)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div className="case-preview" style={{ '--case-accent': box.accent }}>
      <div className="case-hero">
        <span className="case-kicker">{box.label}</span>
        <div className="case-art"><img src={box.image} alt={`Пиксельный кейс ${box.name}`} /></div>
        <h2>{box.name}</h2>
        <p>{box.subtitle}</p>
        <div className="case-price">{box.price} <span>★</span><small>Telegram Stars · планируемая цена</small></div>
      </div>
      <div className="case-demo-note"><b>БЕСПЛАТНЫЙ ПРЕДПРОСМОТР</b><span>Без списания Stars и выдачи предметов.</span></div>
      <h3 className="case-section-title">ВНУТРИ КЕЙСА <span>03 КОНЦЕПТА</span></h3>
      <p className="case-help">Выбери предмет, чтобы посмотреть его анимацию открытия.</p>
      <div className="case-rewards" role="group" aria-label="Предмет для предпросмотра">
        {box.rewards.map((item, index) => (
          <button key={item.id} className={'case-reward' + (selection === index ? ' selected' : '')}
            disabled={phase === 'opening'} aria-pressed={selection === index}
            onClick={() => { setSelection(index); setPhase('idle') }}>
            <span className="case-reward-icon"><Icon name={item.icon} size={28} /></span>
            <span><small>{item.kind}</small><b>{item.name}</b></span>
            <span className="case-odds">{item.chance ? `${item.chance}%` : '—'}</span>
          </button>
        ))}
      </div>
      <p className="case-help">{box.id === 'underground' ? '60 / 25 / 15% — предложенные шансы категорий для будущей версии. В демо ты сам выбираешь результат.' : 'Шансы появятся после подтверждения реальных подарков и их наличия. Здесь показаны вымышленные концепты.'}</p>
      {phase !== 'idle' && (
        <div className={'case-opening ' + phase}>
          <div className="case-reel" aria-hidden="true">
            <div className="case-reel-strip">
              {reel.map((item, index) => <div className="case-reel-item" key={index}><Icon name={item.icon} size={30} /><span>{item.name}</span></div>)}
            </div>
          </div>
          <div className="case-result" role="status" aria-live="polite">
            {phase === 'opening' ? 'Предпросмотр открытия…' : <><small>ВЫБРАННЫЙ КОНЦЕПТ</small><strong>{reward.name}</strong><span>{reward.detail}</span><span>Демонстрация. Предмет не начислен.</span></>}
          </div>
        </div>
      )}
      <button className="case-open" disabled={phase === 'opening'} onClick={() => setPhase('opening')}>
        {phase === 'opening' ? 'ОТКРЫВАЕМ…' : phase === 'result' ? 'ПОВТОРИТЬ АНИМАЦИЮ' : 'ПОСМОТРЕТЬ ОТКРЫТИЕ'} <span>↗</span>
      </button>
      <button className="case-buy" disabled>ПОКУПКА ЗА {box.price} ★ — СКОРО</button>
      <details className="case-rules"><summary>Как будет устроена выдача</summary><p>{box.description}</p><p>Один предмет за открытие. Состав и фиксированные шансы доступны до покупки. Цена предмета не означает возврат Stars.</p><p>В этой версии работает только витрина. Платежи, реальный розыгрыш, подарки и обмен дубликатов ещё недоступны.</p></details>
    </div>
  )
}

export default function Casino({ onClose }) {
  const [selected, setSelected] = useState(CASES[0])
  return (
    <div className="app casino">
      <AppBar title="Казик" onBack={onClose} />
      <div className="app-body scroll casino-body">
        <div className="casino-heading"><span>AFTER HOURS / 01</span><b>Твой следующий<br />редкий дроп.</b><p>Два кейса. Два разных вайба.</p></div>
        <div className="case-tabs" role="group" aria-label="Выбор кейса">
          {CASES.map((box) => <button key={box.id} aria-pressed={box.id === selected.id} onClick={() => setSelected(box)}><img src={box.image} alt="" /><span>{box.name}<small>{box.price} ★</small></span></button>)}
        </div>
        <CasePreview key={selected.id} box={selected} />
      </div>
    </div>
  )
}
