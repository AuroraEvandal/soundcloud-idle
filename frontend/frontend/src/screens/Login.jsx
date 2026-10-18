import { useState } from 'react'
import Icon from '../components/Icon'

const NICK_RE = /^[\p{L}\p{N}_.\- ]{2,16}$/u

// Экран входа: просим ник игрока. Он потом показывается во всём интерфейсе.
export default function Login({ initial = '', onSubmit, busy, error }) {
  const [nick, setNick] = useState(initial)
  const [touched, setTouched] = useState(false)
  const value = nick.trim().replace(/\s+/g, ' ')
  const valid = NICK_RE.test(value)

  function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (valid && !busy) onSubmit(value)
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="login-logo">
        <Icon name="cloud" size={64} color="var(--accent)" />
        <h1>SoundWave</h1>
      </div>
      <label className="login-label" htmlFor="nick">
        Как тебя зовут на сцене?
      </label>
      <input
        id="nick"
        className="input login-input"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        placeholder="Твой ник"
        maxLength={16}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
        disabled={busy}
      />
      <div className="login-hint" data-bad={touched && !valid}>
        {touched && !valid
          ? 'Ник: от 2 до 16 символов, буквы, цифры, пробел, _ . -'
          : 'От 2 до 16 символов. Ник увидят все экраны игры'}
      </div>
      {error && <div className="login-error">{error}</div>}
      <button className="btn" type="submit" disabled={busy || (touched && !valid)}>
        {busy ? 'ВХОД…' : 'ВОЙТИ'}
      </button>
    </form>
  )
}
