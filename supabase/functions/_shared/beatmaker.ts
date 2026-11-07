import { GameError } from './common.ts'

const STEPS = 32
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
}

type Note = { step: number; note: number }
type Pattern = { drums: { kick: number[]; snare: number[]; hihat: number[] }; piano: Note[]; melody: Note[] }

const steps = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length > STEPS) throw new GameError('INVALID_PATTERN')
  const result = value.map(Number)
  if (result.some((n) => !Number.isInteger(n) || n < 0 || n >= STEPS) || new Set(result).size !== result.length) {
    throw new GameError('INVALID_PATTERN')
  }
  return result.sort((a, b) => a - b)
}

const notes = (value: unknown): Note[] => {
  if (!Array.isArray(value) || value.length > 32) throw new GameError('INVALID_PATTERN')
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GameError('INVALID_PATTERN')
    const { step, note } = raw as Record<string, unknown>
    if (!Number.isInteger(step) || Number(step) < 0 || Number(step) >= STEPS ||
        !Number.isInteger(note) || Number(note) < 0 || Number(note) > 23) throw new GameError('INVALID_PATTERN')
    return { step: Number(step), note: Number(note) }
  })
}

export function scoreBeat(input: Record<string, unknown>) {
  const genre = input.genre
  const bpm = Number(input.bpm)
  const key = Number(input.key)
  const scale = input.scale
  if (!['trap', 'plugg', 'cloud_rap', 'drill', 'phonk'].includes(String(genre)) || !Number.isInteger(bpm) || bpm < 60 || bpm > 180 ||
      !Number.isInteger(key) || key < 0 || key > 11 || !Object.hasOwn(SCALES, String(scale))) {
    throw new GameError('INVALID_BEAT')
  }
  const raw = input.pattern as Record<string, unknown>
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GameError('INVALID_PATTERN')
  const rawDrums = raw.drums as Record<string, unknown>
  if (!rawDrums || typeof rawDrums !== 'object' || Array.isArray(rawDrums)) throw new GameError('INVALID_PATTERN')
  const pattern: Pattern = {
    drums: { kick: steps(rawDrums.kick), snare: steps(rawDrums.snare), hihat: steps(rawDrums.hihat) },
    piano: notes(raw.piano),
    melody: notes(raw.melody),
  }
  if (pattern.drums.kick.length < 2 || pattern.drums.snare.length < 2 || pattern.drums.hihat.length < 2 ||
      pattern.piano.length + pattern.melody.length < 2) throw new GameError('INVALID_PATTERN')
  if (pattern.piano.some((n) => pattern.piano.filter((x) => x.step === n.step).length > 1) ||
      pattern.melody.some((n) => pattern.melody.filter((x) => x.step === n.step).length > 1)) throw new GameError('INVALID_PATTERN')

  const kickAnchors: Record<string, number[]> = {
    trap: [0, 8, 16, 24, 6, 14, 22, 30],
    plugg: [0, 6, 8, 16, 22, 24],
    cloud_rap: [0, 8, 16, 24],
    drill: [0, 6, 12, 20, 26],
    phonk: [0, 4, 8, 16, 20, 24],
  }
  const bpmRanges: Record<string, [number, number]> = { trap: [120, 160], plugg: [120, 160], cloud_rap: [90, 150], drill: [130, 155], phonk: [100, 140] }
  const [bpmMin, bpmMax] = bpmRanges[String(genre)]
  const bpmFit = bpm >= bpmMin && bpm <= bpmMax ? 8 : bpm >= bpmMin - 12 && bpm <= bpmMax + 12 ? 5 : 2
  const kickFit = Math.min(12, pattern.drums.kick.filter((s) => kickAnchors[String(genre)].includes(s)).length * 3)
  const snareFit = Math.min(8, pattern.drums.snare.filter((s) => [4, 12, 20, 28].includes(s)).length * 2)
  const hatFit = Math.round(Math.min(pattern.drums.hihat.length, 12) / 12 * 7)
  const rhythm = Math.min(35, bpmFit + kickFit + snareFit + hatFit)

  const scaleSteps = SCALES[String(scale)]
  const allNotes = [...pattern.piano, ...pattern.melody]
  const inScale = allNotes.filter((n) => scaleSteps.includes(((n.note % 12) - key + 12) % 12)).length
  const melodyFit = allNotes.length ? 15 * inScale / allNotes.length : 0
  const consonantIntervals = new Set([0, 3, 4, 5, 7, 8, 9])
  const pianoByStep = new Map(pattern.piano.map((n) => [n.step, n.note]))
  const overlaps = pattern.melody.flatMap((n) => {
    const piano = pianoByStep.get(n.step)
    return piano == null ? [] : [Math.abs(n.note - piano) % 12]
  })
  const overlapFit = overlaps.length ? 15 * overlaps.filter((n) => consonantIntervals.has(n)).length / overlaps.length : (allNotes.length ? 15 : 0)
  const harmony = Math.round(melodyFit + overlapFit)

  const laneCount = Number(pattern.piano.length > 0) + Number(pattern.melody.length > 0) +
    Number(pattern.drums.kick.length > 0 && pattern.drums.snare.length > 0) + Number(pattern.drums.hihat.length > 0)
  const arrangement = Math.min(25, laneCount * 6 + Number(pattern.piano.length > 0 && pattern.melody.length > 0))

  const totalEvents = pattern.drums.kick.length + pattern.drums.snare.length + pattern.drums.hihat.length + allNotes.length
  const density = totalEvents >= 8 && totalEvents <= 28 ? 10 : totalEvents >= 4 && totalEvents <= 32 ? 6 : totalEvents > 0 ? 3 : 0
  const total = Math.min(100, rhythm + harmony + arrangement + density)
  return { genre, bpm, key, scale, pattern, quality_score: total,
    score_breakdown: { rhythm, harmony, arrangement, density } }
}
