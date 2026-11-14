// Reuses the project's CC0 BeatLab recordings; this engine never uploads audio.
export function createConcertAudio() {
  let context, master, compressor, filter, echoWet, timer, origin = 0, step = 0, next = 0, closed = false, sessionType, media, metronome = false
  let mix = .12, voice = true, looping = false, damaged = false, boostUntil = 0, feedback = false
  const channels = {}, buffers = {}, sources = new Set()
  function gain(value, output) {
    const node = context.createGain(); node.gain.value = value; node.connect(output); return node
  }
  function note(frequency, at, duration, output, level = .15, type = 'sine') {
    const source = context.createOscillator(), envelope = context.createGain()
    source.type = type; source.frequency.value = frequency
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(level, at + .012)
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration)
    source.connect(envelope); envelope.connect(output)
    sources.add(source); source.onended = () => { sources.delete(source); source.disconnect(); envelope.disconnect() }
    source.start(at); source.stop(at + duration + .03)
  }
  function sample(lane, at, pitch = 0, level = 1) {
    const source = context.createBufferSource(), envelope = context.createGain()
    source.buffer = buffers[lane]; source.playbackRate.value = 2 ** (pitch / 12)
    envelope.gain.value = level; source.connect(envelope); envelope.connect(channels[lane])
    sources.add(source); source.onended = () => { sources.delete(source); source.disconnect(); envelope.disconnect() }
    source.start(at); source.stop(at + Math.min(1.4, source.buffer.duration / source.playbackRate.value))
  }
  function schedule() {
    if (closed || context.state !== 'running') return
    const elapsed = context.currentTime - origin
    step = Math.max(step, Math.ceil((context.currentTime - origin) / .125))
    next = origin + step * .125
    while (next < context.currentTime + .09) {
      const s = step % 32, bar = Math.floor(step / 32)
      if (metronome) {
        if (s % 4 === 0) note(800, next, .055, master, .2)
        step++; next = origin + step * .125
        continue
      }
      const chord = [0, -3, -5, -2][(looping ? 0 : bar) % 4]
      if ([0, 6, 10, 16, 22, 27].includes(s)) sample('kick', next, 0, .85)
      if (s % 8 === 4) sample('snare', next, mix > .6 ? 1 : 0, .65)
      if (s % 2 === 0 || (mix > .6 && s > 27)) sample('hihat', next, 0, s % 4 ? .25 : .4)
      if ([0, 10, 16, 26].includes(s)) {
        sample('piano', next, chord + (mix > .6 ? 7 : 0), .5)
        note(55 * 2 ** (chord / 12), next, .35, channels.bass, .35, 'triangle')
      }
      if (voice && [2, 7, 12, 18, 23, 28].includes(s)) sample('melody', next, chord + [0, 3, 7, 10][s % 4], .3)
      if (damaged && s % 8 === 0) note(95, next, .3, channels.bass, .08, 'sawtooth')
      // A quiet cue, deliberately bounded so the fictional feedback cannot blast the player.
      if (feedback && s % 4 === 0) note(1100, next, .12, master, .018)
      if (elapsed < boostUntil && s % 4 === 0) sample('snare', next, 7, .16)
      step++; next = origin + step * .125
    }
  }
  function dispose() {
    closed = true; clearInterval(timer)
    for (const source of sources) { try { source.stop() } catch {} }
    sources.clear(); media?.pause()
    if (sessionType != null && navigator.audioSession) navigator.audioSession.type = sessionType
    context?.close().catch(() => {})
  }
  return {
    async start(episode = 0, options = {}) {
      metronome = options.metronome === true
      const Audio = window.AudioContext || window.webkitAudioContext
      if (!Audio) throw new Error('Звук недоступен в этом браузере. Можно играть с визуальным пульсом.')
      context = new Audio({ latencyHint: 'interactive' })
      if (navigator.audioSession) { sessionType = navigator.audioSession.type; navigator.audioSession.type = 'playback' }
      const resumed = context.resume()
      const genre = ['trap', 'cloud_rap', 'plugg'][episode % 3]
      let mediaStarted
      if (!navigator.audioSession) {
        media = new window.Audio('/audio/beatlab/silence.wav'); media.loop = true; mediaStarted = media.play()
      }
      await Promise.all([resumed, mediaStarted, ...(metronome ? [] : ['kick', 'snare', 'hihat', 'piano', 'melody']).map(async lane => {
        const response = await fetch(`/audio/beatlab/${genre}/${lane}.wav`, { signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error('Не загрузились сэмплы. Проверь соединение и повтори.')
        buffers[lane] = await context.decodeAudioData(await response.arrayBuffer())
      })])
      if (closed) return false
      if (context.state !== 'running') throw new Error('Браузер приостановил звук. Нажми «Начать» ещё раз.')
      compressor = context.createDynamicsCompressor(); compressor.threshold.value = -10; compressor.ratio.value = 10
      compressor.connect(context.destination)
      master = gain(.52, compressor)
      filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 12000; filter.connect(master)
      const delay = context.createDelay(1); delay.delayTime.value = .25
      echoWet = gain(0, master)
      const echoFeedback = gain(.23, delay)
      filter.connect(delay); delay.connect(echoWet); delay.connect(echoFeedback)
      for (const [lane, value] of Object.entries({ kick: .85, snare: .7, hihat: .5, piano: .8, melody: .65, bass: .7 })) channels[lane] = gain(value, filter)
      origin = context.currentTime + .08; next = origin; step = 0
      schedule(); timer = setInterval(schedule, 25)
      return true
    },
    get time() { return context ? Math.max(0, context.currentTime - origin) : 0 },
    get suspended() { return context?.state === 'suspended' },
    pause() { if (context?.state === 'running') return context.suspend() },
    async resume() { if (context && !closed) { await context.resume(); if (context.state !== 'running') throw new Error('Не удалось продолжить звук. Повтори нажатие.'); schedule() } },
    set(name, value) {
      if (!context || !master) return
      if (name === 'frequency') filter.frequency.setTargetAtTime(700 + value * 170, context.currentTime, .04)
      if (name === 'level') master.gain.setTargetAtTime(.14 + value / 200, context.currentTime, .03)
      if (name === 'crossfade') { mix = value / 100; channels.piano.gain.setTargetAtTime(.8 - Math.sin(mix * Math.PI) * .2, context.currentTime, .03) }
      if (name === 'voice') { voice = value; channels.melody.gain.setTargetAtTime(value ? .65 : 0, context.currentTime, .03) }
      if (name === 'loop') looping = value
      if (name === 'damage') { damaged = value; channels.hihat.gain.setTargetAtTime(value ? .12 : .5, context.currentTime, .1) }
      if (name === 'feedback') feedback = value
      if (name === 'boost') boostUntil = context.currentTime - origin + 8
      if (name === 'mute') channels[['melody', 'bass', 'piano'][value.channel]].gain.setTargetAtTime(value.muted ? 0 : .65, context.currentTime, .04)
      if (name === 'effect') { filter.frequency.setTargetAtTime(value ? 1400 : 12000, context.currentTime, .2); echoWet.gain.setTargetAtTime(value ? .18 : 0, context.currentTime, .1) }
    },
    previewPad(index) { if (context?.state === 'running' && buffers.kick) sample(['kick', 'snare', 'hihat', 'melody'][index], context.currentTime, 0, .7) },
    dispose,
  }
}
