import { initialComposition } from './beatAudio.js'

export const draftKey = id => `sw_beat_draft_v2:${id}`

export function readDraft(id) {
  try {
    const current = localStorage.getItem(draftKey(id))
    const saved = JSON.parse(current ?? localStorage.getItem(`sw_beat_draft:${id}`))
    const pattern = saved?.pattern
    if (!['kick','snare','hihat'].every(lane => Array.isArray(pattern?.drums?.[lane])) ||
        !Array.isArray(pattern.piano) || !Array.isArray(pattern.melody)) return initialComposition()
    // Discard only the old auto-filled pattern, never an authored or already migrated draft.
    if (current == null) {
      const signature = [pattern.drums.kick.join(','),pattern.drums.snare.join(','),pattern.drums.hihat.join(','),
        ...[pattern.piano,pattern.melody].map(notes => notes.map(n => `${n.step}:${n.note}`).join(','))].join('|')
      if (signature === '0,8,16,24|4,12,20,28|0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30|0:12,16:15|4:19,20:17') {
        return {...saved,pattern:initialComposition().pattern}
      }
    }
    return saved
  } catch { return initialComposition() }
}
