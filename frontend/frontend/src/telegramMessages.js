import { opponentArt } from './opponentArt'
import { opponentDisplayName } from './displayNames'

export const CONTACTS = [
  { id: 'adam', name: 'Менеджер Адам', color: '#0A84FF' },
  { id: 'topor', name: 'ТОПОР 18+', color: '#30D158' },
]

export function initialTelegramMessages(nick) {
  return {
    adam: [
      { text: `Привет, ${nick}! Я твой менеджер. Быстрый гайд по игре:` },
      { text: 'В SoundWave выбери соперника, собери строчку из 4 карточек и нажми «Зачитать». Баттл состоит из 3 раундов.' },
      { text: 'Баттлы дают опыт и популярность. Опыт повышает уровень, а популярность открывает новых соперников.' },
      { text: 'В студии записывай сниппеты: набери хайп до максимума — трек выйдет и принесёт прослушивания и монеты.' },
      { text: 'Монеты трать в магазине. Паки открывай в колоде. У каждой карточки 3 использования — выбирай их с умом. Удачи!' },
    ],
    topor: [],
  }
}

export function victoryTelegramMessages({ nick, opponent, nextOpponent, playerLook }) {
  const finalBoss = opponent?.id === 5 || opponent?.name === 'DOOM RUSHA' || opponent?.name === 'Босс Фестиваля'
  const defeated = opponentDisplayName(opponent)

  if (finalBoss) {
    return {
      adam: [{ text: 'Брат, поздравляю! Ты закрыл DOOM RUSHA. Тебе уже приходят фиты с американской андерграунд-сцены. Ну что, хочешь фитануть?' }],
      topor: [{
        text: `СЕНСАЦИЯ: ${nick} врывается в Америку! После победы над DOOM RUSHA SoundWave выходит на новую сцену. Продолжение — скоро. ЖДИТЕ.`,
        poster: {
          image: opponentArt(5),
          playerLook,
          playerName: nick,
          eyebrow: 'ГЛАВА II',
          title: 'ЗАПАДНАЯ UG СЦЕНА',
          stamp: 'ЖДИТЕ',
        },
      }],
    }
  }

  const nextName = opponentDisplayName(nextOpponent)
  return {
    adam: [{ text: `Йо, ${nick}! Ты забрал баттл у ${defeated}. Красиво сделал. Следующий на очереди — ${nextName}. Давай готовиться, скоро объявим дату.` }],
    topor: [{
      text: `НОВОСТИ: ${nick} врывается на новый уровень! Следующий баттл — против ${nextName}. Афиша уже здесь.`,
      poster: {
        image: opponentArt(nextOpponent?.id),
        playerLook,
        playerName: nick,
        eyebrow: 'СЛЕДУЮЩИЙ БАТТЛ',
        title: `VS ${nextName}`,
        stamp: 'ЖДИТЕ',
      },
    }],
  }
}
