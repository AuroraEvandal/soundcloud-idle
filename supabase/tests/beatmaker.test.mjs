import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { composedBeat } from '../../frontend/frontend/tests/fixtures/beat.mjs'

// The pure scorer only needs GameError, not the database client or Deno environment.
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/beatmaker.ts') && specifier === './common.ts') {
    return { url: 'data:text/javascript,export class GameError extends Error {}', shortCircuit: true }
  }
  return next(specifier, context)
} })
const { scoreBeat, beatName } = await import('../functions/_shared/beatmaker.ts')
hooks.deregister()

test('Trap, Plugg and Cloud rap are scored by the server with unchanged criterion caps', () => {
  for (const genre of ['trap','plugg','cloud_rap']) {
    const result=scoreBeat({...composedBeat(),genre})
    assert.equal(result.genre,genre)
    assert.ok(result.quality_score>0&&result.quality_score<=100)
    assert.equal(result.quality_score,Object.values(result.score_breakdown).reduce((a,b)=>a+b,0))
    for (const [criterion,max] of Object.entries({rhythm:35,harmony:30,arrangement:25,density:10})) {
      assert.ok(result.score_breakdown[criterion]>=0&&result.score_breakdown[criterion]<=max)
    }
  }
})
test('old genres remain valid for saved drafts and ambiguous retries', () => {
  for (const genre of ['drill','phonk']) assert.equal(scoreBeat({...composedBeat(),genre}).genre,genre)
})
test('unknown styles and malformed patterns remain rejected', () => {
  assert.throws(()=>scoreBeat({...composedBeat(),genre:'unknown'}),/INVALID_BEAT/)
  assert.throws(()=>scoreBeat({...composedBeat(),genre:'plugg',bpm:200}),/INVALID_BEAT/)
  const value=composedBeat();value.pattern.drums.kick=[32]
  assert.throws(()=>scoreBeat({...value,genre:'cloud_rap'}),/INVALID_PATTERN/)
})

test('beat names are optional, trimmed and validated before recording',()=>{
  assert.equal(beatName(undefined),null)
  assert.equal(beatName('   '),null)
  assert.equal(beatName('  Ночь  '),'Ночь')
  assert.equal(beatName('я'.repeat(60)).length,60)
  for(const value of [123,{},'я'.repeat(61)]) assert.throws(()=>beatName(value),/INVALID_BEAT_NAME/)
})
