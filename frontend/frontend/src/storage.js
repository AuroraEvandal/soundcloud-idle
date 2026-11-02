// В localStorage лежит только:
//  - sw_battle_id: ID активного батла (разрешено frontend-AGENTS.md, раздел 10)
//  - sw_intro_v1:<playerId>: started/done, отметка просмотра вступления.
// Ник игрока не хранится: он приходит с сервера из Telegram при каждом входе.
const safe = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}

export const readBattleId = () => safe(() => localStorage.getItem('sw_battle_id')) || ''
export const saveBattleId = (v) => safe(() => localStorage.setItem('sw_battle_id', v))
export const clearBattleId = () => safe(() => localStorage.removeItem('sw_battle_id'))

export const readIntro = (playerId) => safe(() => localStorage.getItem(`sw_intro_v1:${playerId}`))
export const saveIntro = (playerId, value) => safe(() => localStorage.setItem(`sw_intro_v1:${playerId}`, value))
