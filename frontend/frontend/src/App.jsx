import { useCallback, useEffect, useRef, useState } from 'react'
import { GameContext } from './GameContext'
import { login, getProfile } from './api'
import { errorInfo } from './errors'
import StatusBar from './components/StatusBar'
import ResourceBar from './components/ResourceBar'
import Dock from './components/Dock'
import Home from './screens/Home'
import SoundWave from './screens/SoundWave'
import Studio from './screens/Studio'
import Deck from './screens/Deck'
import Telegram from './screens/Telegram'
import Profile from './screens/Profile'
import Store from './screens/Store'

const SCREENS = {
  soundwave: SoundWave,
  studio: Studio,
  deck: Deck,
  tg: Telegram,
  profile: Profile,
  store: Store,
}

export default function App() {
  // Ник не спрашиваем у игрока: он приходит с сервера из Telegram (docs/api.md, login)
  const [nick, setNick] = useState('')
  const [player, setPlayer] = useState(null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error | stop
  const [error, setError] = useState('')
  const [screen, setScreen] = useState('home')
  const [island, setIsland] = useState('')
  const [unread, setUnread] = useState(0)
  const islandTimer = useRef(null)

  const notify = useCallback((text) => {
    setIsland(text)
    clearTimeout(islandTimer.current)
    islandTimer.current = setTimeout(() => setIsland(''), 3200)
  }, [])

  const refreshProfile = useCallback(async () => {
    const p = await getProfile()
    setProfile(p)
    setPlayer(p.player)
    setNick(p.player.username)
    return p
  }, [])

  const boot = useCallback(
    async () => {
      setStatus('loading')
      setError('')
      try {
        const res = await login()
        setPlayer(res.player)
        setNick(res.player.username)
        await refreshProfile()
        setStatus('ready')
        if (res.is_new) {
          setUnread(1)
          setTimeout(() => notify('Менеджер Адам: новое сообщение'), 700)
        }
      } catch (e) {
        const info = errorInfo(e)
        if (info.action === 'stop') {
          setStatus('stop')
          setError(info.message)
        } else {
          setError(info.message)
          setStatus('error')
        }
      }
    },
    [notify, refreshProfile],
  )

  useEffect(() => {
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const relogin = useCallback(() => boot(), [boot])

  const ctx = { nick, player, setPlayer, profile, refreshProfile, notify, relogin, unread, setUnread }
  const Screen = SCREENS[screen]

  let body
  if (status === 'loading') {
    body = (
      <div className="center-fill">
        <div className="loader" />
        <div className="muted">Загрузка…</div>
      </div>
    )
  } else if (status === 'stop') {
    body = (
      <div className="center-fill">
        <div className="big-msg">{error}</div>
      </div>
    )
  } else if (status === 'error') {
    body = (
      <div className="center-fill">
        <div className="big-msg">{error}</div>
        <button className="btn" onClick={boot}>
          ПОВТОРИТЬ
        </button>
      </div>
    )
  } else {
    body = (
      <>
        <ResourceBar />
        <div className="viewport">
          {screen === 'home' ? (
            <Home onOpen={setScreen} unread={unread} />
          ) : (
            <Screen onClose={() => setScreen('home')} onOpen={setScreen} />
          )}
        </div>
        {screen === 'home' && <Dock onOpen={setScreen} unread={unread} />}
        <div className="home-indicator" />
      </>
    )
  }

  return (
    <GameContext.Provider value={ctx}>
      <div className="stage">
        <div className="phone">
          <StatusBar island={island} />
          {body}
        </div>
      </div>
    </GameContext.Provider>
  )
}
