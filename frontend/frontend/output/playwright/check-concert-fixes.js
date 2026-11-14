async (page) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    window.__audioChecks = []
    const Context = window.AudioContext
    window.AudioContext = class extends Context {
      constructor(o) {
        super(o); this.testTones = []; window.__audioChecks.push(this)
        const oscillator = this.createOscillator.bind(this)
        this.createOscillator = () => { const n = oscillator(); this.testTones.push(n); return n }
      }
    }
  })
  await page.goto('http://127.0.0.1:5174/concert.html')
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Настроить задержку звука' }).click()
  await page.getByRole('button', { name: 'Включить проверку' }).click()
  await page.getByRole('button', { name: 'В РИТМ · 0/8' }).waitFor()
  await page.waitForTimeout(1100)
  const tones = await page.evaluate(() => window.__audioChecks[0].testTones.map(n => n.frequency.value))
  if (tones.length < 2 || tones.some(n => n !== 800)) throw new Error('Calibration contains musical backing rather than steady clicks')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.getByText('Проверка остановлена при сворачивании. Можно начать заново.').waitFor()
  if (!await page.evaluate(() => window.__audioChecks[0].state === 'closed')) throw new Error('Hidden calibration kept playing')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Заступить на смену ↗' }).click()
  await page.getByRole('button', { name: 'Выйти к сцене ↗' }).click()
  await page.getByRole('button', { name: /02 Держаться сет-листа/ }).click()
  await page.route('**/audio/beatlab/trap/*.wav', async route => { await new Promise(r => setTimeout(r, 600)); await route.continue() })
  await page.getByRole('button', { name: 'Начать концерт' }).click()
  if (await page.getByRole('button', { name: 'Проверить задержку звука' }).isEnabled()) throw new Error('Calibration can open while show is loading')
  if (await page.getByRole('button', { name: 'Назад', exact: true }).isEnabled()) throw new Error('Back can race show loading')
  await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor()
  await page.locator('.ct-cue[data-kind="frequency"]').waitFor()
  await page.screenshot({ path: 'output/playwright/concert-frequency-320.png' })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow at 320px')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.ct-cue[data-kind="feedback"]').waitFor({ timeout: 30000 })
  await page.waitForTimeout(700)
  const overload = page.getByRole('button', { name: /перегруз: приглушить/ })
  await overload.click()
  await page.waitForTimeout(200)
  const before = await page.evaluate(() => window.__audioChecks.at(-1).testTones.filter(n => n.frequency.value === 1100).length)
  await page.waitForTimeout(650)
  const after = await page.evaluate(() => window.__audioChecks.at(-1).testTones.filter(n => n.frequency.value === 1100).length)
  if (before !== after) throw new Error('Feedback still beeps after correct mute')
  await page.getByRole('button', { name: /перегруз: вернуть/ }).click()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await page.getByRole('button', { name: 'Закончить репетицию' }).click()
  if (errors.length) throw new Error(errors.join('\n'))
  await page.screenshot({ path: 'output/playwright/concert-hub-final.png' })
  return { status: 'passed', metronome: true, hiddenStopsCalibration: true, loadingRaceBlocked: true, mutedFeedbackStops: true, mobile320: true, errors }
}
