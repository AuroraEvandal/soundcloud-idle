import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import AppBar from '../components/AppBar'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'

const CONTACTS = [
  { id: 'adam', name: 'Менеджер Адам', color: '#0A84FF' },
  { id: 'rhymes', name: 'Рифмы и П*****', color: '#30D158' },
]

// Чаты: оформление из дизайн-документа. Сообщений от сервера в API нет, поэтому
// менеджер только приветствует игрока по нику, а свои сообщения игрок видит локально.
export default function Telegram({ onClose }) {
  const { nick, setUnread } = useGame()
  const [open, setOpen] = useState(null)
  const [log, setLog] = useState({ adam: [{ me: false, text: `Привет, ${nick}! Я твой менеджер` }], rhymes: [] })
  const [text, setText] = useState('')
  const endRef = useRef(null)

  useEffect(() => setUnread(0), [setUnread])
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'end' }), [log, open])

  const preview = (c) => {
    const l = log[c.id]
    if (c.id === 'rhymes' && !l.length) return 'Новый биф!'
    return l.length ? l[l.length - 1].text : 'Нет сообщений'
  }

  function send(e) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setLog((l) => ({ ...l, [open.id]: [...l[open.id], { me: true, text: t }] }))
    setText('')
  }

  if (open) {
    return (
      <div className="app">
        <AppBar onBack={() => setOpen(null)} bg="var(--bar)">
          <span className="chat-head">
            <Avatar name={open.name} color={open.color} size={30} />
            {open.name}
          </span>
        </AppBar>
        <div className="app-body chat scroll">
          {log[open.id].map((m, i) => (
            <div key={i} className={'bubble ' + (m.me ? 'me' : 'them')}>
              {m.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="inputbar" onSubmit={send}>
          <input
            className="input"
            placeholder="Сообщение..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="icon-btn" aria-label="Отправить">
            <Icon name="send" />
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="appbar tg-bar">
        <button className="appbar-btn" onClick={onClose} aria-label="Назад">
          <Icon name="back" />
        </button>
        <div className="appbar-title">ЧАТЫ</div>
        <div className="appbar-right">
          <Icon name="compose" />
        </div>
      </header>
      <div className="app-body scroll">
        {CONTACTS.map((c) => (
          <button className="chat-item" key={c.id} onClick={() => setOpen(c)}>
            <Avatar name={c.name} color={c.color} size={48} />
            <div className="chat-main">
              <div className="chat-name">{c.name}</div>
              <div className="chat-prev">{preview(c)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
