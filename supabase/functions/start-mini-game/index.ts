import { authPlayer, db, GameError, handle, requestId, rpcError } from '../_shared/common.ts'

const QUESTIONS = [
  ['Залетел на бит — и сразу в…', ['хит', 'компот', 'шкаф']],
  ['На мне дизайнерский drip, на ногах…', ['Rick Owens', 'сковородки', 'будильники']],
  ['Мой новый трек взорвал район — весь двор поёт в…', ['унисон', 'унитаз', 'микроволновку']],
  ['Забрал гонорар — пополнил свой…', ['балик', 'чайник', 'коврик']],
  ['Бас качает, слышит весь подъезд — это мой…', ['бэнгер', 'блендер', 'принтер']],
] as const

Deno.serve((req) => {
  const receivedAt = Date.now()
  return handle(req, async (body) => {
    const { player } = await authPlayer(body)
    const battleId = requestId(body.battleId)
    if (!Number.isSafeInteger(body.roundNumber) || ![2, 3].includes(body.roundNumber as number)) throw new GameError('INVALID_ROUND')
    if (!['prepare', 'start'].includes(String(body.actionId))) throw new GameError('INVALID_MINI_GAME_ACTION')
    const kind = ['timing', 'slang', 'wave'][Math.floor(Math.random() * 3)]
    const [prompt, answers] = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]
    const options = answers.map((text) => ({ id: crypto.randomUUID(), text }))
    const answer_id = options[0].id
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    const result = await db.rpc('mini_game_start', {
      p_player_id: player.id, p_battle_id: battleId, p_round_number: body.roundNumber,
      p_action_id: body.actionId, p_game: { kind, prompt, options, answer_id },
    })
    rpcError(result.error)
    return { ...result.data, server_processing_ms: Date.now() - receivedAt }
  })
})
