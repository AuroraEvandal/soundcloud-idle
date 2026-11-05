// Local preview only: no scoring, rewards or audio uploads.
export const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
export const noteName = (note) => `${NOTE_NAMES[note % 12]}${3 + Math.floor(note / 12)}`
export function initialComposition() {
  return { genre: 'trap', bpm: 140, key: 0, scale: 'minor', pattern: {
    drums: { kick: [0,8,16,24], snare: [4,12,20,28], hihat: [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30] },
    piano: [{step:0,note:12},{step:16,note:15}], melody: [{step:4,note:19},{step:20,note:17}],
  } }
}
export function createBeatPlayer() {
  let context, timer, nextTime, nextStep = 0, generation = 0
  function stop() {
    generation += 1; clearTimeout(timer)
    if (context) context.close().catch(() => {})
    context = null
  }
  async function play(composition, onStep) {
    stop()
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) throw new Error('Этот браузер не поддерживает прослушивание')
    const audio = new Audio(); context = audio
    const session = generation
    await audio.resume()
    if (session !== generation) return
    const master = audio.createGain(); master.gain.value = 0.22; master.connect(audio.destination)
    const noise = audio.createBuffer(1, audio.sampleRate * 0.15, audio.sampleRate)
    const values = noise.getChannelData(0)
    for (let i=0;i<values.length;i++) values[i] = Math.random()*2-1
    const sound = (lane, note, time) => {
      const gain = audio.createGain(); gain.connect(master)
      const duration = lane === 'piano' ? 0.35 : lane === 'melody' ? 0.22 : 0.14
      gain.gain.setValueAtTime(lane === 'hihat' ? 0.25 : 0.6,time)
      gain.gain.exponentialRampToValueAtTime(0.001,time+duration)
      let source
      if (lane === 'hihat' || lane === 'snare') {
        source = audio.createBufferSource(); source.buffer = noise
        const filter = audio.createBiquadFilter(); filter.type = 'highpass'
        filter.frequency.value = lane === 'hihat' ? 7000 : 1400
        source.connect(filter); filter.connect(gain)
      } else {
        source = audio.createOscillator(); source.type = lane === 'melody' ? 'triangle' : 'sine'
        source.frequency.setValueAtTime(lane === 'kick' ? 140 : 440 * 2 ** ((48+note-69)/12),time)
        if (lane === 'kick') source.frequency.exponentialRampToValueAtTime(40,time+0.12)
        source.connect(gain)
      }
      source.start(time); source.stop(time+duration)
      source.onended = () => { source.disconnect(); gain.disconnect() }
    }
    nextTime = audio.currentTime + 0.04; nextStep = 0
    function tick() {
      if (session !== generation) return
      while (nextTime < audio.currentTime + 0.1) {
        for (const lane of ['kick','snare','hihat']) if (composition.pattern.drums[lane].includes(nextStep)) sound(lane,0,nextTime)
        for (const lane of ['piano','melody']) {
          const note = composition.pattern[lane].find(n => n.step === nextStep)
          if (note) sound(lane,note.note,nextTime)
        }
        nextTime += 60 / composition.bpm / 4; nextStep = (nextStep+1)%32
      }
      const visible = Math.floor(Math.max(0,audio.currentTime-0.04) / (60/composition.bpm/4))%32
      onStep(visible)
      timer = setTimeout(tick,25)
    }
    tick()
  }
  return { play, stop }
}
