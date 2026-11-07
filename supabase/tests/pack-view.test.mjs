import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packView } from '../functions/_shared/packView.ts'

const balance = { common_weight: 70, rare_weight: 24, epic_weight: 6 }
const basic = { id: 1, name: 'Базовый пак', price: 200, clothing_chance: '0.07', card_slot: null,
  common_weight: null, rare_weight: null, epic_weight: null }
const cards = ['setup', 'development', 'boost', 'punch'].flatMap(slot =>
  ['common', 'rare', 'epic'].map(rarity => ({ slot, rarity })))

test('pack odds include the clothing roll, local overrides and player ownership', () => {
  const view = packView(basic, balance, cards, true)
  assert.deepEqual(view.drop_chances, { common: 65.1, rare: 22.32, epic: 5.58, clothing: 7 })
  assert.deepEqual(packView(basic, balance, cards, false).drop_chances,
    { common: 70, rare: 24, epic: 6, clothing: 0 })
  assert.deepEqual(packView({ ...basic, id: 2, price: 500, common_weight: '40', rare_weight: '40', epic_weight: '20' }, balance, cards, true).drop_chances,
    { common: 37.2, rare: 37.2, epic: 18.6, clothing: 7 })
  assert.ok(view.description.length > 0)
  assert.deepEqual(Object.keys(view), ['id', 'name', 'price', 'description', 'drop_chances'])
})

test('slot odds match available categories and never show clothing', () => {
  for (const [index, slot] of ['setup', 'development', 'boost', 'punch'].entries()) {
    const pack = { ...basic, id: index + 3, card_slot: slot, clothing_chance: 0 }
    assert.deepEqual(packView(pack, balance, cards, true).drop_chances,
      { common: 70, rare: 24, epic: 6, clothing: 0 })
    const filtered = cards.filter(c => c.slot !== slot || c.rarity === 'rare')
    assert.deepEqual(packView(pack, balance, filtered, true).drop_chances,
      { common: 0, rare: 100, epic: 0, clothing: 0 })
    assert.match(packView(pack, balance, cards, true).description, /Без одежды/)
    assert.equal(packView(pack, balance, cards.filter(c => c.slot !== slot), true).drop_chances, null)
  }
})
