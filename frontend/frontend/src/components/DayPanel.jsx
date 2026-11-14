import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { errorInfo } from '../errors'
import ErrorBox from './ErrorBox'
import './DayPanel.css'

function NightDialog({ children, busy, onClose, title }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="night-dialog" aria-labelledby="night-title" onCancel={event => {
    event.preventDefault()
    if (!busy) onClose()
  }}>
    <h2 id="night-title">{title}</h2>
    {children}
  </dialog>
}

export default function DayPanel() {
  const { player, finishDay, dayReport, setDayReport, refreshProfile } = useGame()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const locked = useRef(false)
  if (!player?.game_day) return null
  const debt = player.debt
  async function sleep() {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(null)
    try { await finishDay(); setConfirm(false) }
    catch (e) {
      setError(errorInfo(e))
      if (e.code === 'DAY_CHANGED') await refreshProfile().catch(() => {})
    } finally { locked.current = false; setBusy(false) }
  }
  return <>
    <section className="day-panel" aria-label="Игровой день">
      <div className="row-between"><b>День {player.game_day}</b><span>{player.energy} энергии</span></div>
      <p>{debt?.remaining ? `Долг: ${debt.remaining} ₽ · ${debt.due_tonight ? `сегодня ночью ${debt.payment_due} ₽` : 'первый платёж в ночь дня 3'}` : 'Долг погашен. Теперь работаешь на себя.'}</p>
      {debt?.reminder && <p className="debt-message">Забыл про свой долг? Каждый день будешь возвращать по частям. С завтрашней ночи — по 100 ₽.</p>}
      {debt?.missed_payments > 0 && <p className="debt-message" role="status">Просрочек подряд: {debt.missed_payments}/3. Следующий платёж — {debt.payment_due} ₽. Третья неоплата начнёт игру заново; покупки за Stars сохранятся.</p>}
      <button className="btn day-end" onClick={() => { setConfirm(true); setError(null) }}>Завершить день</button>
      <small>За ночь +70–100 энергии, максимум 100. Остаток сохраняется.</small>
    </section>
    {confirm && !dayReport && <NightDialog title={`Завершить день ${player.game_day}?`} busy={busy} onClose={() => setConfirm(false)}>
      <p>Доход выпущенных битов начислится автоматически. Ночь пополнит энергию до 100; запас выше 100 сохранится.</p>
      <p>{debt?.due_tonight ? `Платёж этой ночи: ${debt.payment_due} ₽. Сейчас на счету ${player.coins} ₽.` : debt?.remaining ? 'Этой ночью платить по долгу ещё не нужно.' : 'Долг полностью погашен.'}</p>
      {debt?.due_tonight && <p>Если полной суммы не хватит, деньги останутся на счету, а неоплаченная сумма вырастет на 50%. Третья подряд неоплата сбросит прохождение.</p>}
      <ErrorBox message={error?.message} />
      <div className="night-actions"><button className="btn" disabled={busy} onClick={sleep}>{busy ? 'Подводим итоги…' : 'Лечь спать'}</button><button className="btn secondary" disabled={busy} onClick={() => setConfirm(false)}>Ещё поиграть</button></div>
    </NightDialog>}
    {dayReport && <NightDialog title={dayReport.reset ? 'Кредитор забрал всё' : `Наступил день ${player.game_day}`} onClose={() => setDayReport(null)}>
      {dayReport.reset ? <p>Три платежа подряд пропущены. Начинаешь заново: 300 ₽, 100 энергии и долг 1000 ₽. Покупки за Stars сохранены.</p> : <>
        <dl className="night-totals"><div><dt>Восстановлено энергии</dt><dd>+{dayReport.energy_gained}</dd></div><div><dt>Доход битов</dt><dd>+{dayReport.coins_earned} ₽</dd></div><div><dt>Прослушивания</dt><dd>+{dayReport.streams_earned}</dd></div><div><dt>Оплата долга</dt><dd>−{dayReport.debt_paid} ₽</dd></div><div><dt>Баланс</dt><dd>{player.coins} ₽</dd></div></dl>
        {dayReport.missed_payments > 0 && <p className="debt-message">На платёж {dayReport.debt_due} ₽ не хватило. Деньги не списаны. Просрочка со штрафом: {dayReport.overdue} ₽.</p>}
        {dayReport.releases?.length > 0 && <ul className="night-releases">{dayReport.releases.map(item => <li key={`${item.beat_id}:${item.installment}`}><span>{item.name} · часть {item.installment}/3</span><b>+{item.coins} ₽</b></li>)}</ul>}
      </>}
      <button className="btn day-end" onClick={() => setDayReport(null)}>{dayReport.reset ? 'Начать заново' : 'Начать день'}</button>
    </NightDialog>}
  </>
}
