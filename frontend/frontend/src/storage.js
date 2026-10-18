// В localStorage лежат только:
//  - sw_battle_id: ID активного батла (разрешено frontend-AGENTS.md, раздел 10)
//  - sw_nick: ник, который игрок ввёл на экране входа (настройка интерфейса, не игровые данные)
const safe = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}

export const readNick = () => safe(() => localStorage.getItem('sw_nick')) || ''
export const saveNick = (v) => safe(() => localStorage.setItem('sw_nick', v))
export const clearNick = () => safe(() => localStorage.removeItem('sw_nick'))

export const readBattleId = () => safe(() => localStorage.getItem('sw_battle_id')) || ''
export const saveBattleId = (v) => safe(() => localStorage.setItem('sw_battle_id', v))
export const clearBattleId = () => safe(() => localStorage.removeItem('sw_battle_id'))
