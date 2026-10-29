import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import AppBar from '../components/AppBar'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import CharacterModel from '../components/CharacterModel'
import { CONTACTS } from '../telegramMessages'

// Чаты пока используют локальные сообщения; новых ответов от сервера нет.
export default function Telegram({ onClose }) {
  const { setUnread, telegramMessages, setTelegramMessages } = useGame()
  const [open, setOpen] = useState(null)
  const [text, setText] = useState('')
  const endRef = useRef(null)

  useEffect(() => setUnread(0), [setUnread])
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'end' }), [telegramMessages, open])

  const preview = (c) => {
    const l = telegramMessages[c.id] || []
    if (c.id === 'topor' && !l.length) return 'Новости баттлов и афиши'
    return l.length ? l[l.length - 1].text : 'Нет сообщений'
  }

  function send(e) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setTelegramMessages((messages) => ({ ...messages, [open.id]: [...(messages[open.id] || []), { me: true, text: t }] }))
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
          {(telegramMessages[open.id] || []).map((m, i) => (
            <div key={i} className={'bubble ' + (m.me ? 'me' : 'them')}>
              {m.text}
              {m.poster && (
                <div className="telegram-poster">
                  <div className="telegram-poster-stage">
                    <span className="telegram-poster-eyebrow">{m.poster.eyebrow}</span>
                    <div className="telegram-poster-fighters">
                      <div className="telegram-poster-fighter">
                        <CharacterModel look={m.poster.playerLook || {}} />
                        <small>{m.poster.playerName}</small>
                      </div>
                      {m.poster.image && <img src={m.poster.image} alt="" />}
                    </div>
                    <strong>{m.poster.title}</strong>
                    <span className="telegram-poster-stamp">{m.poster.stamp}</span>
                  </div>
                </div>
              )}
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
