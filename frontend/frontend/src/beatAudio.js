import { BEAT_KITS } from './beatKits.js'

// Local preview only: no scoring, rewards or audio uploads.
export const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
export const noteName = note => `${NOTE_NAMES[note % 12]}${3 + Math.floor(note / 12)}`
export function initialComposition() {
  return { genre: 'trap', bpm: 140, key: 0, scale: 'minor', pattern: {
    drums: { kick: [], snare: [], hihat: [] }, piano: [], melody: [],
  } }
}

export function createBeatPlayer() {
  let context, timer, master, limiter, media, previousSessionType = null, generation = 0
  const buffers = new Map(), sources = new Set()
  function stop() {
    generation += 1
    clearTimeout(timer)
    for (const source of sources) source.stop()
    sources.clear()
    master?.disconnect(); limiter?.disconnect(); media?.pause()
    if (previousSessionType != null) {
      navigator.audioSession.type = previousSessionType
      previousSessionType = null
    }
  }
  function dispose() {
    stop()
    context?.close().catch(() => {})
    context = null; buffers.clear(); media = null
  }
  function sample(url) {
    if (!buffers.has(url)) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      const pending = fetch(url, { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('sample'); return response.arrayBuffer() })
        .then(bytes => context.decodeAudioData(bytes))
        .catch(() => { buffers.delete(url); throw new Error('Не удалось загрузить звуки. Проверь интернет и нажми «Слушать» ещё раз.') })
        .finally(() => clearTimeout(timeout))
      buffers.set(url, pending)
    }
    return buffers.get(url)
  }
  async function play(composition, onStep) {
    stop()
    const session = generation
    try {
      // iOS otherwise treats Web Audio as ambient sound and obeys the silent switch.
      if (navigator.audioSession) {
        previousSessionType = navigator.audioSession.type
        navigator.audioSession.type = 'playback'
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) throw new Error('Этот браузер не поддерживает прослушивание')
      context ||= new AudioContext()
      const audio = context
      const resumed = audio.resume()
      let mediaStarted
      if (!navigator.audioSession) {
        // Older WebKit needs an active media element to use the music audio route.
        media ||= new window.Audio('/audio/beatlab/silence.wav')
        media.loop = true
        mediaStarted = media.play()
      }
      const genre = Object.hasOwn(BEAT_KITS, composition.genre) ? composition.genre : 'trap'
      const kit = BEAT_KITS[genre], lanes = ['kick','snare','hihat','piano','melody']
      const [sounds] = await Promise.all([
        Promise.all(lanes.map(lane => sample(`/audio/beatlab/${genre}/${lane}.wav`))), resumed, mediaStarted,
      ])
      if (session !== generation) return false
      if (audio.state !== 'running') throw new Error('Не удалось включить звук. Нажми «Слушать» ещё раз и проверь громкость мультимедиа.')
      master = audio.createGain(); master.gain.value = .4
      limiter = audio.createDynamicsCompressor()
      limiter.threshold.value = -6; limiter.knee.value = 12; limiter.ratio.value = 12
      master.connect(limiter); limiter.connect(audio.destination)
      const sound = (lane, note, time) => {
        const source = audio.createBufferSource(), gain = audio.createGain()
        source.buffer = sounds[lanes.indexOf(lane)]
        source.playbackRate.value = lane in kit.roots ? 2 ** ((note-kit.roots[lane])/12) : 1
        const duration = Math.min(4, source.buffer.duration/source.playbackRate.value)
        const level = { kick: .9, snare: .65, hihat: .3, piano: .65, melody: .5 }[lane]
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(level, time+.003)
        gain.gain.setValueAtTime(level, time+Math.max(.003, duration-.025))
        gain.gain.linearRampToValueAtTime(0, time+duration)
        source.connect(gain); gain.connect(master)
        sources.add(source)
        source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect() }
        source.start(time); source.stop(time+duration)
      }
      const startTime = audio.currentTime+.04, stepDuration = 60/composition.bpm/4
      let nextTick = 0
      function tick() {
        if (session !== generation) return
        nextTick = Math.max(nextTick, Math.ceil((audio.currentTime-startTime)/stepDuration))
        while (startTime+nextTick*stepDuration < audio.currentTime+.1) {
          const at = nextTick%32, time = startTime+nextTick*stepDuration
          for (const lane of ['kick','snare','hihat']) if (composition.pattern.drums[lane].includes(at)) sound(lane, 0, time)
          for (const lane of ['piano','melody']) {
            const note = composition.pattern[lane].find(n => n.step === at)
            if (note) sound(lane, note.note, time)
          }
          nextTick += 1
        }
        onStep(Math.floor(Math.max(0, audio.currentTime-startTime)/stepDuration)%32)
        timer = setTimeout(tick, 25)
      }
      tick()
      return true
    } catch (error) {
      if (session !== generation) return false
      stop()
      throw error
    }
  }
  return { play, stop, dispose }
}
