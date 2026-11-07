import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialCareer, makeShow, resolveEvent, finishShow, buyUpgrade, timingResult, targetAt } from '../src/concert/model.js'

test('every concert contains all six mechanics and leaves breathing room before the ending', () => {
  for (let episode = 0; episode < 6; episode++) {
    const show = makeShow(episode, 'artist')
    assert.equal(show.events.length, 24)
    assert.equal(new Set(show.events.map(e => e.kind)).size, 6)
    assert.ok(show.events.every(e => e.at >= 0 && e.at + e.duration < 175))
    assert.ok(show.events.every((e, i, all) => !i || e.at >= all[i - 1].at + all[i - 1].duration))
  }
})

test('resolving an event twice cannot change quality, combo or score', () => {
  const show = makeShow(0, 'artist')
  const once = resolveEvent(show, show.events[0].id, 'perfect')
  assert.equal(once.quality, 73)
  assert.equal(once.energy, 40)
  assert.deepEqual(resolveEvent(once, show.events[0].id, 'miss'), once)
  assert.deepEqual(resolveEvent(once, 'unknown', 'perfect'), once)
})

test('two errors enable assistance and successful recovery restores quality', () => {
  let show = makeShow(0, 'artist')
  show = resolveEvent(show, show.events[0].id, 'miss')
  show = resolveEvent(show, show.events[1].id, 'miss')
  assert.equal(show.assisted, true)
  show = resolveEvent(show, show.events[2].id, 'good')
  assert.equal(show.assisted, false)
  assert.ok(show.quality > 56)
})

test('repeated clear rewards base money but never duplicates first-clear or goal bonuses', () => {
  let show = makeShow(0, 'artist')
  for (const e of show.events) show = resolveEvent(show, e.id, 'perfect')
  const career = initialCareer()
  const first = finishShow(career, show)
  assert.equal(first.result.rank, 'S')
  assert.equal(first.career.coins, 490)
  assert.equal(first.career.reputation, 25)
  const repeat = finishShow(first.career, { ...show, id: 'another-show' })
  assert.equal(repeat.career.coins, 630)
  assert.equal(repeat.result.bonus, 0)
  assert.deepEqual(finishShow(first.career, show).career, first.career)
})

test('missing events count as zero and a failed show cannot unlock the next episode', () => {
  const show = makeShow(0, 'owner')
  const result = finishShow(initialCareer(), { ...show, failed: true })
  assert.equal(result.result.rank, '—')
  assert.equal(result.career.coins, 230)
  assert.equal(result.career.completed.length, 0)
  assert.equal(finishShow(initialCareer(), show).result.rank, 'C')
})

test('upgrades enforce funds and one-time ownership', () => {
  const career = initialCareer()
  assert.deepEqual(buyUpgrade(career, 'marks'), career)
  assert.deepEqual(buyUpgrade(career, 'unknown'), career)
  const bought = buyUpgrade({ ...career, coins: 300 }, 'marks')
  assert.equal(bought.coins, 50)
  assert.deepEqual(bought.upgrades, ['marks'])
  assert.deepEqual(buyUpgrade(bought, 'marks'), bought)
})

test('rhythm judges nearest beat with a calibrated offset', () => {
  assert.equal(timingResult(100, 0), 'perfect')
  assert.equal(timingResult(100.08, 0), 'perfect')
  assert.equal(timingResult(100.17, 0), 'good')
  assert.equal(timingResult(100.25, 0), 'miss')
  assert.equal(timingResult(100.17, 170), 'perfect')
})

test('moving targets remain reachable and frozen targets do not drift', () => {
  const e = { target: 65, kind: 'level', at: 3, moving: true }
  for (let t = 3; t < 10; t += .1) assert.ok(targetAt(e, t) >= 45 && targetAt(e, t) <= 85)
  assert.equal(targetAt({ ...e, moving: false }, 10), 65)
})

