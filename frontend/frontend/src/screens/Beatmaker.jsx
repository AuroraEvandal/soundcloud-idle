import { useCallback, useEffect, useRef, useState } from 'react'
import { getBeatmaker, recordBeat, sellBeat, releaseBeat, collectBeat } from '../api'
import { useGame } from '../GameContext'
import { errorInfo } from '../errors'
import { initialComposition, createBeatPlayer, NOTE_NAMES, noteName } from '../beatAudio'
import ErrorBox from '../components/ErrorBox'
import Icon from '../components/Icon'
import './Beatmaker.css'

const LANES = [['kick','Бочка','Kick · низкий удар'],['snare','Малый барабан','Snare · акцент'],['hihat','Хай-хэт','Hi-hat · пульс'],['piano','Пианино','Основа гармонии'],['melody','Мелодия','Верхняя линия']]
const CRITERIA = [['rhythm','Ритм',35],['harmony','Гармония',30],['arrangement','Аранжировка',25],['density','Плотность',10]]
const STATUS = { draft:'Записан', sold:'Продан', streaming:'На стриминге', complete:'Стриминг завершён' }
const draftKey = (id) => `sw_beat_draft:${id}`
function readDraft(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(id)))
    if (['kick','snare','hihat'].every(lane=>Array.isArray(saved?.pattern?.drums?.[lane])) && Array.isArray(saved.pattern.piano) && Array.isArray(saved.pattern.melody)) return saved
  } catch { /* private mode or invalid local draft */ }
  return initialComposition()
}

export default function Beatmaker({ onEnergyChange }) {
  const { player, setPlayer, notify } = useGame()
  const [composition,setComposition] = useState(() => readDraft(player.id))
  const [data,setData] = useState(null), [error,setError] = useState(null), [busy,setBusy] = useState(false)
  const [bar,setBar] = useState(0), [pitch,setPitch] = useState({piano:12,melody:19})
  const [playing,setPlaying] = useState(false), [step,setStep] = useState(-1), [result,setResult] = useState(null)
  const [playback,setPlayback] = useState(null)
  const listening = playing && playback?.id != null
  const displayed = listening ? playback.composition : composition
  const busyRef = useRef(false), mounted = useRef(false), audio = useRef(null)
  const loadVersion = useRef(0)
  const stop = useCallback(() => { audio.current?.stop(); setPlaying(false); setStep(-1); setPlayback(null) },[])
  const load = useCallback(async (before = null) => {
    try {
      const version = ++loadVersion.current
      const response = await getBeatmaker(before)
      if (!mounted.current || version !== loadVersion.current) return
      setData(current => ({...response, beats: before ? [...(current?.beats || []),...response.beats] : response.beats}))
      setPlayer(response.player); setError(null)
    } catch(e) { if (mounted.current) setError(errorInfo(e)) }
  },[setPlayer])
  useEffect(() => { mounted.current=true; load(); return () => { mounted.current=false; audio.current?.stop() } },[load])
  useEffect(() => { try { localStorage.setItem(draftKey(player.id),JSON.stringify(composition)) } catch {} },[composition,player.id])

  function edit(next) { stop(); setComposition(next) }
  function toggle(lane,at) {
    const next = structuredClone(composition)
    if (lane in next.pattern.drums) {
      const notes = next.pattern.drums[lane]
      next.pattern.drums[lane] = notes.includes(at) ? notes.filter(n=>n!==at) : [...notes,at].sort((a,b)=>a-b)
    } else {
      const existing = next.pattern[lane].find(n=>n.step===at)
      next.pattern[lane] = next.pattern[lane].filter(n=>n.step!==at)
      if (!existing || existing.note!==pitch[lane]) next.pattern[lane].push({step:at,note:pitch[lane]})
      next.pattern[lane].sort((a,b)=>a.step-b.step)
    }
    edit(next)
  }
  async function preview(value, id = null) {
    if (playing && playback?.id === id) { stop(); return }
    stop()
    try {
      audio.current ||= createBeatPlayer()
      setPlayback({id,composition:structuredClone(value)})
      setBar(0)
      setPlaying(true)
      await audio.current.play(value,at=>{ if(mounted.current) { setStep(at); setBar(Math.floor(at/16)) } })
    } catch(e) { stop(); setError({message:e.message}) }
  }
  async function act(operation) {
    if (busyRef.current) return
    busyRef.current=true; setBusy(true); setError(null); stop()
    try {
      const response = await operation()
      setPlayer(response.player)
      if (!mounted.current) return
      if (response.beat) setResult(response.beat)
      if (response.coins_earned != null) notify(`Бит: +${response.coins_earned} монет`)
      if (response.max_streams != null) notify(`Бит выпущен: до ${response.max_streams} стримов за 24 часа`)
      await load(); onEnergyChange?.()
    } catch(e) { if(mounted.current) setError(errorInfo(e)) }
    finally { busyRef.current=false; if(mounted.current) setBusy(false) }
  }
  async function more() {
    if (busyRef.current || !data?.next_cursor) return
    busyRef.current=true; setBusy(true)
    try { await load(data.next_cursor) }
    finally { busyRef.current=false; if(mounted.current) setBusy(false) }
  }
  const beatCard = (beat) => <article className="bm-beat" key={beat.id}>
    <div className="bm-beat-heading">
      <div>
        <span className={`bm-status bm-status-${beat.status}`}>{STATUS[beat.status]}</span>
        <h4>{beat.genre.toUpperCase()} <span>/ {beat.bpm} BPM</span></h4>
        <time dateTime={beat.created_at}>{new Date(beat.created_at).toLocaleString('ru-RU')}</time>
      </div>
      <div className="bm-quality" aria-label={`Качество: ${beat.quality_score} из 100`}><strong>{beat.quality_score}</strong><span>/ 100</span></div>
    </div>
    <div className="bm-beat-tools">
      <button className="bm-button" disabled={busy} aria-pressed={playing && playback?.id===beat.id} onClick={()=>preview({...beat,key:beat.musical_key},beat.id)}><span aria-hidden="true">{playing && playback?.id===beat.id?'■':'▶'}</span>{playing && playback?.id===beat.id?'Стоп':'Слушать'}</button>
      <details className="bm-score-details">
        <summary>Разбор оценки</summary>
        <div className="bm-scores">{CRITERIA.map(([key,label,max])=><div key={key}><span>{label}<b>{beat.score_breakdown[key]} <small>/ {max}</small></b></span><div className="bm-score-track"><i style={{width:`${beat.score_breakdown[key]/max*100}%`}} /></div></div>)}</div>
      </details>
    </div>
    {beat.stream_cap != null && <div className="bm-streams"><div><span>Доступно сейчас</span><b>{beat.collectable_coins || 0} монет <small>· {beat.collectable_streams || 0} стримов</small></b></div><p>Собрано {beat.streams_paid} из {beat.stream_cap} стримов</p></div>}
    {beat.status==='sold' && <p className="bm-sale"><Icon name="check" size={18} />Получено <b>{beat.sale_coins} монет</b></p>}
    {beat.status==='draft' && <div className="bm-decisions">
      <button className="bm-choice" disabled={busy} onClick={()=>act(()=>sellBeat(beat.id))}><span><b>Продать сейчас</b><small>Гарантированные монеты</small></span>{beat.instant_sale_coins!=null && <span className="bm-choice-value">{beat.instant_sale_coins}<small>монет</small></span>}</button>
      <button className="bm-choice" disabled={busy} onClick={()=>act(()=>releaseBeat(beat.id))}><span><b>Выпустить на стриминг</b><small>Стримы за 24 часа · случайный лимит</small></span><Icon name="cloud" size={24} /></button>
      <p className="bm-caption">Продажу или выпуск нельзя отменить.</p>
    </div>}
    {['streaming','complete'].includes(beat.status) && <button className="bm-button bm-collect" disabled={busy} onClick={()=>act(()=>collectBeat(beat.id))}>Собрать стримы<Icon name="back" size={16} /></button>}
  </article>
  return <div className="bm">
    <header className="bm-heading"><div className="bm-eyebrow">BEAT LAB <span>2 такта · 5 дорожек</span></div><h2>Собери бит</h2><p>Сначала послушай. Меняй клетки на дорожках и записывай, когда понравится результат.</p></header>
    <ErrorBox message={error?.message} onRetry={()=>load()} />
    <fieldset disabled={busy} className="bm-editor">
      {listening && <p className="bm-listening" role="status"><Icon name="headphones" size={20} /><span>Играет запись: {displayed.genre.toUpperCase()} / {displayed.bpm} BPM.<br/><small>Останови её, чтобы вернуться к своему рисунку.</small></span></p>}
      <details className="bm-panel bm-sound-settings">
        <summary><span className="bm-section-index">01</span><span><b>Настройки звука</b><small>{displayed.genre.toUpperCase()} · {displayed.bpm} BPM · {NOTE_NAMES[displayed.key]} {displayed.scale==='minor'?'минор':'мажор'}</small></span></summary>
        <fieldset className="bm-settings" disabled={listening}>
          <label>Стиль<select value={displayed.genre} onChange={e=>edit({...composition,genre:e.target.value})}>{['trap','drill','phonk'].map(v=><option key={v} value={v}>{v.toUpperCase()}</option>)}</select></label>
          <label>Темп <span>BPM</span><input type="number" inputMode="numeric" min="60" max="180" value={displayed.bpm} onChange={e=>edit({...composition,bpm:Number(e.target.value)})}/></label>
          <label>Тональность<select value={displayed.key} onChange={e=>edit({...composition,key:Number(e.target.value)})}>{NOTE_NAMES.map((v,i)=><option key={v} value={i}>{v}</option>)}</select></label>
          <label>Лад<select value={displayed.scale} onChange={e=>edit({...composition,scale:e.target.value})}><option value="minor">Минор</option><option value="major">Мажор</option></select></label>
        </fieldset>
        <p className="bm-caption">BPM — скорость бита. Тональность и лад задают его настроение.</p>
      </details>
      <section className="bm-panel bm-sequence" aria-labelledby="bm-sequence-title">
        <div className="bm-section-heading"><span className="bm-section-index">02</span><h3 id="bm-sequence-title">Собери рисунок</h3></div>
        <p className="bm-description">Цветная клетка — звук. Пустая — пауза.</p>
        <div className="bm-sequence-toolbar">
          <div className="bm-bars" role="group" aria-label="Такт">{[0,1].map(v=><button key={v} aria-pressed={bar===v} onClick={()=>setBar(v)}>Такт {v+1}</button>)}</div>
          <span className="bm-step-count">16 шагов</span>
        </div>
        <div className="bm-scroll-hint"><span>4 доли в каждом такте</span><span>Листай сетку →</span></div>
        <div className="bm-sequencer" role="region" aria-label="Сетка звуков. Прокрути вправо, чтобы увидеть все 16 шагов." tabIndex={0}>
          <div className="bm-sequence-content">
            <div className="bm-ruler" aria-hidden="true">{Array.from({length:16},(_,i)=><span key={i} className={i%4===0?'downbeat':''}>{i%4===0?`${i/4+1}`:'·'}</span>)}</div>
            {LANES.map(([lane,label,hint])=><div className={`bm-lane bm-lane-${lane}`} key={lane}>
              <div className="bm-lane-heading"><div className="bm-lane-name"><i aria-hidden="true"/><span><b>{label}</b><small>{hint}</small></span></div>{['piano','melody'].includes(lane)&&<label className="bm-note">Нота<select disabled={listening} aria-label={`Нота: ${label}`} value={pitch[lane]} onChange={e=>setPitch({...pitch,[lane]:Number(e.target.value)})}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{noteName(i)}</option>)}</select></label>}</div>
              <div className="bm-grid">{Array.from({length:16},(_,i)=>{
                const at=bar*16+i, note=displayed.pattern[lane]?.find(n=>n.step===at)
                const active=lane in displayed.pattern.drums ? displayed.pattern.drums[lane].includes(at) : Boolean(note)
                return <button key={at} disabled={listening} className={`${active?'active ':''}${step===at?'cursor ':''}${i%4===0?'downbeat':''}`} aria-label={`${label}, шаг ${at+1}${note?`, ${noteName(note.note)}`:''}`} aria-pressed={active} onClick={()=>toggle(lane,at)}>{note?NOTE_NAMES[note.note%12]:<span aria-hidden="true">{active?'•':'·'}</span>}</button>
              })}</div>
            </div>)}
          </div>
        </div>
        <div className="bm-edit-tools"><button className="bm-button" disabled={listening} onClick={()=>edit(initialComposition())}>Вернуть шаблон</button><button className="bm-button bm-clear" disabled={listening} onClick={()=>edit({...composition,pattern:{drums:{kick:[],snare:[],hihat:[]},piano:[],melody:[]}})}>Очистить всё</button></div>
      </section>
      <div className="bm-transport">
        <div className="bm-energy"><span>Энергия <b>{data?.energy ?? '…'} <small>/ 100</small></b></span><button className="bm-link" onClick={()=>load()}>Обновить</button></div>
        <div className="bm-transport-buttons"><button className="bm-button bm-play" aria-pressed={playing} onClick={()=>playing?stop():preview(composition)}><span aria-hidden="true">{playing?'■':'▶'}</span><span>{playing?'Стоп':'Слушать'}<small>Бесплатно</small></span></button><button className="bm-record" disabled={listening || !data || data.energy<data.energy_cost} onClick={()=>act(()=>recordBeat(composition))}><Icon name="mic" size={20}/><span>{busy?'Сохраняем…':'Записать бит'}<small>{data?.energy_cost ?? 50} энергии</small></span></button></div>
        {data && data.energy<data.energy_cost && <p className="bm-energy-hint" role="status">Нужно {data.energy_cost} энергии. Дождись восстановления и нажми «Обновить».</p>}
      </div>
    </fieldset>
    {result && <section className="bm-result" aria-label="Результат записи"><div className="bm-section-heading"><Icon name="check" size={20}/><h3>Последняя запись</h3></div>{beatCard(data?.beats.find(b=>b.id===result.id)||result)}</section>}
    <section className="bm-library" aria-labelledby="bm-library-title">
      <div className="bm-section-heading"><span className="bm-section-index">03</span><h3 id="bm-library-title">Мои биты</h3><button className="bm-link" disabled={busy} onClick={()=>load()}>Обновить</button></div>
      <p className="bm-description">После записи ты получишь оценку. Затем реши: монеты сразу или стримы в течение 24 часов.</p>
      {!data && !error && <div className="bm-empty" role="status">Загружаем записи…</div>}
      {data?.beats.length===0 && <div className="bm-empty"><Icon name="compose" size={28}/><b>Здесь будет твой первый бит</b><p>Послушай рисунок и нажми «Записать бит».<br/>Появятся оценка и варианты заработка.</p></div>}
      {data?.beats.filter(b=>b.id!==result?.id).map(beatCard)}
      {data?.next_cursor && <button className="bm-button bm-more" disabled={busy} onClick={more}>Загрузить ещё</button>}
    </section>
  </div>
}
