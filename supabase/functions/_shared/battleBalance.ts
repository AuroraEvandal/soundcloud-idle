export type BattleBalance = { skill_step: number; charisma_step: number; max_skill_bonus: number }
export function skilledPoints(scores: Record<string, number>, skills: Record<string, unknown>, clothingCharisma: number, balance: BattleBalance) {
  const multiplier = (value: number, step: number) => 1 + Math.min(Number(balance.max_skill_bonus), Math.max(0, value) * Number(step))
  const skill = (key: string) => multiplier(Number(skills[`skill_${key}`] || 1) - 1, Number(balance.skill_step))
  const charisma = multiplier(Number(skills.skill_charisma || 1) - 1 + clothingCharisma, Number(balance.charisma_step))
  return Math.round((scores.rhyme * 0.25 * skill('rhyme') + scores.flow * 0.25 * skill('flow') +
    scores.punch * 0.3 * skill('punch') + scores.meaning * 0.2) * 10 * charisma)
}
