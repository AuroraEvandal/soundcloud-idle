// РИФМА: сравнение ЗВУКОВ окончания строки, а не букв.
// Файл без зависимостей — его можно проверять напрямую:
//   node supabase/tests/rhyme.test.mjs
//
// Учитываются: гласные (я→а, ё→о, ю→у, е→э), классы глухих/звонких согласных
// (п≡б, т≡д, к≡г, с≡з, ф≡в), вставные соноранты м/н/л/р (ап/амп звучит alike),
// латиница переводится в русские звуки (up→«ап»). Без словаря ударений это
// эвристика: рифмованная зона = последняя гласная + хвост до конца слова,
// а вторая от конца гласная и согласные между ними дают «богатую» рифму.

const clamp = (x: number, min = 0, max = 10) => Math.max(min, Math.min(max, x))
const half = (x: number) => Math.round(x * 2) / 2

// Латиница → русские звуки (примерно, для вставок типа up/dumb).
const TRANSLIT: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'э', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т',
  u: 'а', v: 'в', w: 'в', x: 'кс', y: 'и', z: 'з',
}
const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я'])
const VOWEL_SOUND: Record<string, string> = { а: 'а', я: 'а', о: 'о', ё: 'о', у: 'у', ю: 'у', и: 'и', ы: 'ы', э: 'э', е: 'э' }
const CONSONANT_CLASS: Record<string, string> = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с', п: 'п', ф: 'ф', к: 'к', т: 'т', ш: 'ш', с: 'с' }
// Соноранты можно «вставить» внутрь хвоста без потери созвучия.
const SONORANT_RE = /[мнлрй]/g

interface WordTail {
  lastVowel: string
  prevVowel: string | null      // вторая от конца гласная, если есть
  tail: string                  // согласные после последней гласной (по классам)
  inter: string | null          // согласные между prevVowel и lastVowel (по классам)
}

function wordTail(text: string): WordTail | null {
  let phonetic = ''
  for (const ch of text.toLowerCase()) phonetic += TRANSLIT[ch] ?? ch
  const words = phonetic.split(/[^а-яё]+/).filter(Boolean)
  const word = [...(words[words.length - 1] || '')]
  const vowelIdx = word.map((ch, i) => (VOWELS.has(ch) ? i : -1)).filter((i) => i >= 0)
  if (vowelIdx.length === 0) return null
  const last = vowelIdx[vowelIdx.length - 1]
  const prev = vowelIdx.length >= 2 ? vowelIdx[vowelIdx.length - 2] : null
  const chain = (from: number, to: number) =>
    word.slice(from, to).filter((ch) => !VOWELS.has(ch)).map((ch) => CONSONANT_CLASS[ch] ?? ch).join('')
  return {
    lastVowel: VOWEL_SOUND[word[last]],
    prevVowel: prev === null ? null : VOWEL_SOUND[word[prev]],
    tail: chain(last + 1, word.length),
    inter: prev === null ? null : chain(prev + 1, last),
  }
}

const stripSonorants = (s: string) => s.replace(SONORANT_RE, '')

// Штраф за разницу длин строк — ОТНОСИТЕЛЬНЫЙ: чем короче строки, тем строже.
// Примеры: слоги равны — без штрафа; разница 1 слог — минус 0.5 балла;
// 10/11 почти не режет балл, а 4/6 — сразу минус 5 (2×(diff−1)/min, максимум −50%).
function lengthFactor(diff: number, minSyll: number): number {
  if (diff <= 0) return 1
  if (diff === 1) return 0.95
  if (minSyll <= 0) return 1 // слоги неизвестны — не штрафуем
  return Math.max(0.5, 1 - (2 * (diff - 1)) / minSyll)
}

export function pairRhyme(cardA: Record<string, unknown>, cardB: Record<string, unknown>): number {
  const wa = wordTail(String(cardA.text))
  const wb = wordTail(String(cardB.text))
  if (!wa || !wb) return 0.5
  let score: number
  if (wa.lastVowel === wb.lastVowel && wa.tail === wb.tail) {
    if (wa.prevVowel && wb.prevVowel && wa.prevVowel === wb.prevVowel) {
      score = wa.inter === wb.inter ? 10 : 9.5 // богатая рифма (низко/близко, тапки/бабки)
    } else {
      score = 9 // точная рифма от последней гласной (ок/игрок, имя/могила)
    }
  } else if (wa.lastVowel === wb.lastVowel) {
    score = stripSonorants(wa.tail) === stripSonorants(wb.tail) ? 8.5 : 6.5 // ап/амп или ассонанс
  } else if (wa.tail === wb.tail) {
    score = 3 // хвост совпал, гласная нет
  } else {
    score = 0.5
  }
  const sylA = Number(cardA.syllables || 0)
  const sylB = Number(cardB.syllables || 0)
  return half(clamp(score * lengthFactor(Math.abs(sylA - sylB), Math.min(sylA, sylB)), 0.5, 10))
}

export function rhymeScore(cards: Record<string, unknown>[]) {
  return half(clamp((pairRhyme(cards[0], cards[1]) + pairRhyme(cards[2], cards[3])) / 2))
}
