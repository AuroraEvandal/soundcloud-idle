import { useEffect, useState } from 'react'
import { STORY_SCENES } from '../story'
import { opponentArt } from '../opponentArt'
import styles from './StoryIntro.module.css'

export default function StoryIntro({ nick, onFinish, replay = false }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const scene = STORY_SCENES[index]
  const last = index === STORY_SCENES.length - 1

  useEffect(() => {
    if (paused || last) return
    const timer = setTimeout(() => setIndex((current) => Math.min(current + 1, STORY_SCENES.length - 1)), 5000)
    return () => clearTimeout(timer)
  }, [index, paused, last])

  return (
    <section className={styles.intro} aria-label="История фрешмена">
      <header className={styles.header}>
        <div className={styles.brand}><b>SW.</b><span>THE COME UP<br />ИСТОРИЯ ФРЕШМЕНА</span></div>
        <button onClick={() => onFinish(false)}>{replay ? 'Закрыть' : 'Пропустить'} ↗</button>
        <div className={styles.progress} aria-label={`Сцена ${index + 1} из ${STORY_SCENES.length}`}>
          {STORY_SCENES.map((item, i) => <span key={item.id} data-active={i <= index} />)}
        </div>
      </header>
      <div className={styles.body}>
        <figure className={styles.frame} data-scene={scene.id} key={scene.id}>
          <div className={styles.sceneBar}><span>ГЛАВА 00 — ДО ПЕРВОГО БАТТЛА</span><b>{String(index + 1).padStart(2, '0')}</b></div>
          <div className={styles.picture} aria-hidden="true">
            <span className={styles.backdropWord}>{['NO NAME', 'NO REPLY', 'ON AIR', 'GO VIRAL', 'FIRST VS'][index]}</span>
            <div className={styles.performers} data-paused={paused}>
              <img src="/player/freshman.png" alt="" draggable="false" />
              {last && <><b className={styles.vs}>VS</b><img src={opponentArt(1)} alt="" draggable="false" /></>}
            </div>
            {(index === 2 || index === 3) && <div className={styles.cameraFrame}><span>● REC</span><b>TikTok</b><small>@{nick}</small></div>}
            <span className={styles.sceneTag}>{['ДЕБЮТ / 0 СЛУШАТЕЛЕЙ', 'ДИСС ОСТАЛСЯ БЕЗ ОТВЕТА', 'ЗАПИСЬ ПЕРВОГО ВИДЕО', 'ТЕБЯ УЖЕ ОБСУЖДАЮТ ↗', 'ТЫ × 3гот2010'][index]}</span>
          </div>
          <figcaption className={styles.caption}>{scene.caption}</figcaption>
        </figure>
        <div className={styles.copy} aria-live="polite" aria-atomic="true">
          <span className={styles.eyebrow}>{scene.label}</span>
          <h1>{scene.title}</h1>
          <p>{scene.text}</p>
        </div>
      </div>
      <footer className={styles.footer}>
        <div className={styles.transport}>
          <button disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Назад</button>
          <span>{String(index + 1).padStart(2, '0')} / 05</span>
          <button onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? '▶ Продолжить' : 'Ⅱ Пауза'}</button>
        </div>
        <button className={styles.next} onClick={() => last ? onFinish(!replay) : setIndex((current) => Math.min(current + 1, STORY_SCENES.length - 1))}>
          {last ? (replay ? 'ВЕРНУТЬСЯ В ИГРУ' : 'К ПЕРВОМУ БАТТЛУ') : 'СЛЕДУЮЩАЯ СЦЕНА'} <span>↗</span>
        </button>
      </footer>
    </section>
  )
}
