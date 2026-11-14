async (page) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    const Original = window.AudioContext
    window.__concertAudio = []
    window.AudioContext = class extends Original {
      constructor(options) {
        super(options); window.__concertAudio.push(this)
        const original = this.createDynamicsCompressor.bind(this)
        this.createDynamicsCompressor = () => { const node = original(); this.testAnalyser = this.createAnalyser(); node.connect(this.testAnalyser); return node }
      }
    }
  })
  await page.goto('http://127.0.0.1:5174/concert.html')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'output/playwright/concert-hub-390.png' })
  await page.getByRole('button', { name: 'Заступить на смену ↗' }).click()
  await page.screenshot({ path: 'output/playwright/concert-story-390.png' })
  await page.getByRole('button', { name: 'Выйти к сцене ↗' }).click()
  await page.getByRole('button', { name: /01 Довериться артисту/ }).click()
  await page.getByRole('button', { name: 'Начать концерт' }).click()
  await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor()
  await page.getByRole('slider', { name: 'Частота эквалайзера' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  const before = await page.locator('.ct-time').innerText()
  await page.waitForTimeout(1200)
  if (await page.locator('.ct-time').innerText() !== before) throw new Error('Pause advanced the concert clock')
  if (!await page.evaluate(() => window.__concertAudio[0].state === 'suspended')) throw new Error('Pause did not suspend audio')
  await page.screenshot({ path: 'output/playwright/concert-pause-390.png' })
  await page.getByRole('button', { name: 'Продолжить концерт ↗' }).click()
  await page.locator('.ct-modal').waitFor({ state: 'detached' })
  const seen = new Set(), screenshots = new Set()
  let lastPad = 0, capturedAudio = false, lastStatus = ''
  const endAt = Date.now() + 200000
  while (Date.now() < endAt) {
    if (await page.locator('.ct-result').count()) break
    const kind = await page.evaluate(() => document.querySelector('.ct-cue')?.dataset.kind || null)
    if (!kind) { await page.waitForTimeout(80); continue }
    seen.add(kind)
    if (!screenshots.has(kind)) {
      screenshots.add(kind)
      await page.screenshot({ path: `output/playwright/concert-${kind}-390.png` })
    }
    const status = await page.locator('.ct-desk-bottom').innerText()
    if (status !== lastStatus) { console.log(status.replaceAll('\n', ' ')); lastStatus = status }
    if (!capturedAudio) {
      const audio = await page.evaluate(() => {
        const ctx = window.__concertAudio[0], data = new Float32Array(ctx.testAnalyser.fftSize)
        ctx.testAnalyser.getFloatTimeDomainData(data)
        return { state: ctx.state, rms: Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length) }
      })
      if (audio.rms > .001) { capturedAudio = true; console.log('Audio verified', audio) }
    }
    await page.evaluate(({ lastPad }) => {
      const kind = document.querySelector('.ct-cue')?.dataset.kind
      if (kind === 'frequency') {
        const marker = document.querySelector('.ct-target-track > i'), knob = document.querySelector('.ct-knob')
        const target = parseFloat(marker.style.left) + parseFloat(marker.style.width) / 2, value = Number(knob.getAttribute('aria-valuenow'))
        if (Math.abs(value - target) > 1) knob.dispatchEvent(new KeyboardEvent('keydown', { key: value < target ? 'ArrowRight' : 'ArrowLeft', bubbles: true }))
      }
      if (kind === 'level' || kind === 'crossfade') {
        const el = document.querySelector('.ct-fader-zone input')
        const marker = el.previousElementSibling
        const target = parseFloat(marker.style.left) + parseFloat(marker.style.width) / 2
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(Math.round(target)))
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
        document.querySelector('.ct-secondary-cue:not(:disabled)')?.click()
      }
      const pulse = Number(document.querySelector('.ct-pulse')?.style.opacity) === 1
      if (kind === 'pads' && Date.now() - (window.__lastConcertPad || 0) > 250 && pulse) {
        document.querySelector('.ct-pads button.is-next')?.click(); window.__lastConcertPad = Date.now()
      }
      if (kind === 'feedback') {
        const channel = document.querySelector('.ct-channels .ct-overload')
        if (channel && (channel.innerText.includes('MUTE') || channel.innerText.includes('ВЕРНУТЬ'))) channel.click()
      }
      if (kind === 'artist') {
        const button = document.querySelector('.ct-command')
        if (button && !button.disabled && (!button.classList.contains('is-active') || pulse)) button.click()
      }
    }, { lastPad })
    await page.waitForTimeout(35)
  }
  if (!await page.locator('.ct-result').count()) throw new Error('Concert did not finish')
  if (seen.size !== 6) throw new Error(`Only saw ${[...seen]}`)
  if (!capturedAudio) throw new Error('No audible PCM measured')
  await page.screenshot({ path: 'output/playwright/concert-result-390.png' })
  console.log('RESULT', await page.locator('.ct-result').innerText())
  await page.getByRole('button', { name: /Обновить пульт/ }).click()
  const buy = page.getByRole('button', { name: '250 ₽ · Установить' })
  if (!await buy.isEnabled()) throw new Error('Earned budget did not enable first upgrade')
  await buy.click()
  if (!await page.getByRole('button', { name: 'Установлено ✓' }).count()) throw new Error('Upgrade purchase not reflected')
  await page.screenshot({ path: 'output/playwright/concert-gear-390.png' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.screenshot({ path: 'output/playwright/concert-gear-320.png' })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow at 320px')
  await page.getByRole('button', { name: 'Выступления 06' }).click()
  if (!await page.getByRole('button', { name: /02 Человек за стеной/ }).isEnabled()) throw new Error('Next chapter remained locked')
  await page.screenshot({ path: 'output/playwright/concert-hub-320.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'output/playwright/concert-desktop.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: all mechanics, audible audio, pause, complete concert, rewards, shop, chapter unlock, 320px and desktop')
}
