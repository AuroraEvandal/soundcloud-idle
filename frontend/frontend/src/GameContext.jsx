import { createContext, useContext } from 'react'

// Общее состояние интерфейса: ник, игрок, профиль. Игровую логику не содержит.
export const GameContext = createContext(null)
export const useGame = () => useContext(GameContext)
