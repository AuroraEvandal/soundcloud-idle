import { useCallback, useEffect, useRef, useState } from 'react'
import { GameContext } from './GameContext'
import { login, getProfile, getPets } from './api'
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
import Casino from './screens/Casino'
import StoryIntro from './components/StoryIntro'
import { initialTelegramMessages } from './telegramMessages'
import { readIntro, saveIntro } from './storage'
import { shouldShowIntro } from './story'

const SCREENS = {
  soundwave: SoundWave,
  studio: Studio,
  deck: Deck,
  tg: Telegram,
  profile: Profile,
  store: Store,
  casino: Casino,
}

export default function App() {
  // Ник не спрашиваем у игрока: он приходит с сервера из Telegram (docs/api.md, login)
  const [nick, setNick] = useState('')
  const [player, setPlayer] = useState(null)
  const [profile, setProfile] = useState(null)
  const [petCollection, setPetCollection] = useState(null)
  const [petsError, setPetsError] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error | stop
  const [error, setError] = useState('')
  const [screen, setScreen] = useState('home')
  const [intro, setIntro] = useState(null)
  const [island, setIsland] = useState('')
  const [unread, setUnread] = useState(0)
  const [telegramMessages, setTelegramMessages] = useState({ adam: [], topor: [] })
  const islandTimer = useRef(null)
  const deliveredTelegramEvents = useRef(new Set())

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

  const refreshPets = useCallback(async () => {
    try {
      const collection = await getPets()
      setPetCollection(collection)
      setPetsError(null)
      return collection
    } catch (e) {
      setPetsError(errorInfo(e))
      throw e
    }
  }, [])

  const boot = useCallback(
    async () => {
      setStatus('loading')
      setError('')
      try {
        const res = await login()
        setPlayer(res.player)
        setNick(res.player.username)
        if (shouldShowIntro(res.is_new, readIntro(res.player.id))) {
          saveIntro(res.player.id, 'started')
          setIntro('new')
        }
        setTelegramMessages((current) => current.adam.length ? current : initialTelegramMessages(res.player.username))
        // The optional pet collection must not hold the game's loading screen.
        refreshPets().catch(() => {})
        await refreshProfile()
        setStatus('ready')
        if (res.is_new) {
          setUnread(1)
          notify('Менеджер Адам: новое сообщение')
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
    [notify, refreshProfile, refreshPets],
  )

  useEffect(() => {
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const relogin = useCallback(() => boot(), [boot])

  const addTelegramMessages = useCallback((incoming, eventId) => {
    if (eventId && deliveredTelegramEvents.current.has(eventId)) return
    if (eventId) deliveredTelegramEvents.current.add(eventId)
    const added = Object.values(incoming).reduce((count, messages) => count + messages.length, 0)
    setTelegramMessages((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(incoming).map(([chat, messages]) => [chat, [...(current[chat] || []), ...messages]])),
    }))
    if (added) setUnread((count) => count + added)
  }, [])

  const activePet = petCollection?.pets.find((pet) => pet.id === petCollection.active_pet_id && pet.owned) || null
  const ctx = { nick, player, setPlayer, profile, refreshProfile, petCollection, setPetCollection, activePet, petsError, refreshPets, notify, relogin, unread, setUnread, telegramMessages, setTelegramMessages, addTelegramMessages }
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
  } else if (intro) {
    body = <StoryIntro nick={nick} replay={intro === 'replay'} onFinish={(toBattle) => {
      if (intro === 'new') saveIntro(player.id, 'done')
      setIntro(null)
      if (toBattle) setScreen('soundwave')
    }} />
  } else {
    body = (
      <>
        <ResourceBar />
        <div className="viewport">
          {screen === 'home' ? (
            <Home onOpen={setScreen} unread={unread} />
          ) : (
            <Screen onClose={() => setScreen('home')} onOpen={setScreen} onReplayIntro={() => setIntro('replay')} />
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
