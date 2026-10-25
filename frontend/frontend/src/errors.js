// Таблица ошибок из frontend-AGENTS.md (раздел 9). Коды берём только из docs/api.md.
// action: stop | relogin | home | resync | stay | retry
const TABLE = {
  INVALID_INIT_DATA: ['Открой игру через Telegram', 'stop'],
  PLAYER_NOT_FOUND: ['', 'relogin'],
  BATTLE_NOT_FOUND: ['Этот батл не найден', 'home'],
  BATTLE_FINISHED: ['Батл уже закончен', 'home'],
  BATTLE_IN_PROGRESS: ['Сначала закончи текущий батл', 'home'],
  ROUND_ALREADY_SUBMITTED: ['Этот раунд уже отправлен', 'resync'],
  INVALID_ROUND: ['Что-то пошло не так, попробуй ещё раз', 'resync'],
  INVALID_CARDS: ['Собери строчку из 4 карточек', 'stay'],
  CARD_NOT_OWNED: ['Такой карточки у тебя нет', 'resync'],
  OPPONENT_LOCKED: ['Соперник откроется при N популярности', 'stay'],
  DAILY_LIMIT: ['Лимит оценок на сегодня исчерпан. Возвращайся завтра', 'home'],
  IDEMPOTENCY_CONFLICT: ['Запрос уже использован для другого действия. Обнови игру', 'home'],
  CARD_POOL_TOO_SMALL: ['Для батла пока не хватает карточек в одном из слотов', 'home'],
  JUDGE_UNAVAILABLE: ['Судья сейчас недоступен. Раунд не отправлен, попробуй позже', 'retry'],
  // Коды ниже ждут согласования (API-PROPOSAL.md)
  NOT_ENOUGH_COINS: ['Не хватает монет', 'stay'],
  ALREADY_OWNED: ['Это у тебя уже есть', 'stay'],
  ITEM_NOT_FOUND: ['Предмет не найден', 'stay'],
  NOT_OWNED: ['Этого предмета у тебя нет', 'stay'],
  NO_ENERGY: ['Нет энергии. Подожди, она восстанавливается', 'stay'],
  INTERNAL: ['Ошибка сервера. Попробуй ещё раз', 'retry'],
}

export function errorInfo(err, extra = {}) {
  if (err?.network) {
    return { code: 'NETWORK', message: 'Нет соединения. Проверь интернет и повтори', action: 'retry' }
  }
  const code = TABLE[err?.code] ? err.code : 'INTERNAL'
  let [message, action] = TABLE[code]
  if (code === 'OPPONENT_LOCKED' && extra.required != null) {
    message = `Соперник откроется при ${extra.required} популярности`
  }
  return { code, message, action }
}
