import { useCallback, useEffect, useRef, useState } from 'react'
import { getBeatmaker, recordBeat, sellBeat, releaseBeat, collectBeat } from '../api'
import { useGame } from '../GameContext'
import { errorInfo } from '../errors'
import { initialComposition, createBeatPlayer, NOTE_NAMES, noteName } from '../beatAudio'
import ErrorBox from '../components/ErrorBox'
import './Beatmaker.css'

const LANES = [['kick','Kick'],['snare','Snare'],['hihat','Hi-hat'],['piano','Пианино'],['melody','Мелодия']]
const CRITERIA = [['rhythm','Ритм',35],['harmony','Гармония',30],['arrangement','Аранжировка',25],['density','Плотность',10]]
const STATUS = { draft:'Черновик', sold:'Продан', streaming:'На стриминге', complete:'Стриминг завершён' }
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
    <div className="row-between"><b>{beat.genre.toUpperCase()} · {beat.bpm} BPM</b><strong>{beat.quality_score}/100</strong></div>
    <small className="muted">{STATUS[beat.status]} · {new Date(beat.created_at).toLocaleString('ru-RU')}</small>
    <div className="bm-scores">{CRITERIA.map(([key,label,max])=><span key={key}>{label}<b>{beat.score_breakdown[key]} / {max}</b></span>)}</div>
    {beat.stream_cap != null && <p className="small-t">Лимит: {beat.stream_cap} стримов · собрано {beat.streams_paid}<br/>Доступно сейчас: {beat.collectable_streams || 0} стримов / {beat.collectable_coins || 0} монет</p>}
    {beat.status==='sold' && <p>Продан за {beat.sale_coins} монет</p>}
    <div className="bm-actions">
      <button className="btn small" disabled={busy} aria-pressed={playing && playback?.id===beat.id} onClick={()=>preview({...beat,key:beat.musical_key},beat.id)}>{playing && playback?.id===beat.id?'СТОП':'СЛУШАТЬ'}</button>
      {beat.status==='draft' && <><button className="btn small" disabled={busy} onClick={()=>act(()=>sellBeat(beat.id))}>ПРОДАТЬ СРАЗУ{beat.instant_sale_coins!=null?` · ₽${beat.instant_sale_coins}`:''}</button><button className="btn small" disabled={busy} onClick={()=>act(()=>releaseBeat(beat.id))}>ВЫПУСТИТЬ НА 24 Ч</button></>}
      {['streaming','complete'].includes(beat.status) && <button className="btn small" disabled={busy} onClick={()=>act(()=>collectBeat(beat.id))}>СОБРАТЬ СТРИМЫ</button>}
    </div>
  </article>
  return <div className="bm pad">
    <div className="bm-heading"><small>BEAT LAB / 02 BARS</small><h2>Собери своё звучание</h2><p className="muted small-t">Тапай клетки. Для пианино и мелодии сначала выбери ноту. Прослушивание бесплатно.</p></div>
    <ErrorBox message={error?.message} onRetry={()=>load()} />
    <fieldset disabled={busy} className="bm-editor">
      {listening && <p role="status">Слушаем сохранённый бит · {displayed.genre.toUpperCase()} / {displayed.bpm} BPM. Черновик сохранён — вернётся после остановки.</p>}
      <fieldset className="bm-settings" disabled={listening} style={{border:0,padding:0,margin:0}}>
        <label>Стиль<select value={displayed.genre} onChange={e=>edit({...composition,genre:e.target.value})}>{['trap','drill','phonk'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label>BPM<input type="number" min="60" max="180" value={displayed.bpm} onChange={e=>edit({...composition,bpm:Number(e.target.value)})}/></label>
        <label>Тональность<select value={displayed.key} onChange={e=>edit({...composition,key:Number(e.target.value)})}>{NOTE_NAMES.map((v,i)=><option key={v} value={i}>{v}</option>)}</select></label>
        <label>Лад<select value={displayed.scale} onChange={e=>edit({...composition,scale:e.target.value})}><option value="minor">Минор</option><option value="major">Мажор</option></select></label>
      </fieldset>
      <div className="bm-actions"><button className="btn small" onClick={()=>playing?stop():preview(composition)}>{playing?'■ СТОП':'▶ СЛУШАТЬ'}</button><button className="btn small" disabled={listening} onClick={()=>edit(initialComposition())}>ШАБЛОН</button><button className="btn small" disabled={listening} onClick={()=>edit({...composition,pattern:{drums:{kick:[],snare:[],hihat:[]},piano:[],melody:[]}})}>ОЧИСТИТЬ</button></div>
      <div className="bm-bars" role="group" aria-label="Такт">{[0,1].map(v=><button key={v} aria-pressed={bar===v} onClick={()=>setBar(v)}>ТАКТ {v+1}</button>)}</div>
      {LANES.map(([lane,label])=><div className="bm-lane" key={lane}>
        <div className="row-between"><label>{label}</label>{['piano','melody'].includes(lane)&&<select disabled={listening} aria-label={`Нота: ${label}`} value={pitch[lane]} onChange={e=>setPitch({...pitch,[lane]:Number(e.target.value)})}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{noteName(i)}</option>)}</select>}</div>
        <div className="bm-grid">{Array.from({length:16},(_,i)=>{
          const at=bar*16+i, note=displayed.pattern[lane]?.find(n=>n.step===at)
          const active=lane in displayed.pattern.drums ? displayed.pattern.drums[lane].includes(at) : Boolean(note)
          return <button key={at} disabled={listening} className={`${active?'active ':''}${step===at?'cursor ':''}${i%4===0?'downbeat':''}`} aria-label={`${label}, шаг ${at+1}${note?`, ${noteName(note.note)}`:''}`} aria-pressed={active} onClick={()=>toggle(lane,at)}>{note?NOTE_NAMES[note.note%12]:i%4===0?i/4+1:'·'}</button>
        })}</div>
      </div>)}
      <button className="btn bm-record" disabled={listening || !data || data.energy<data.energy_cost} onClick={()=>act(()=>recordBeat(composition))}>{busy?'СОХРАНЯЕМ…':`ЗАПИСАТЬ · ${data?.energy_cost ?? 50} ЭНЕРГИИ`}</button>
      <p className="muted small-t">Энергия на сервере: {data?.energy ?? '…'} / 100 <button className="bm-link" onClick={()=>load()}>Обновить</button></p>
    </fieldset>
    {result && <section aria-label="Результат записи"><h3>Последний результат</h3>{beatCard(data?.beats.find(b=>b.id===result.id)||result)}</section>}
    <div className="row-between"><h3>Мои биты</h3><button className="btn small" disabled={busy} onClick={()=>load()}>ОБНОВИТЬ</button></div>
    <p className="muted small-t">Продажа — гарантированные монеты. Выпуск — стримы за 24 часа со случайным лимитом. После выбора изменить решение нельзя.</p>
    {!data && !error && <p>Загрузка…</p>}
    {data?.beats.length===0 && <p className="muted">Здесь появится первая запись.</p>}
    {data?.beats.filter(b=>b.id!==result?.id).map(beatCard)}
    {data?.next_cursor && <button className="btn" disabled={busy} onClick={more}>ЗАГРУЗИТЬ ЕЩЁ</button>}
  </div>
}
