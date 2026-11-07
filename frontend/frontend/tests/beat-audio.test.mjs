import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createBeatPlayer, initialComposition } from '../src/beatAudio.js'
import { BEAT_KITS } from '../src/beatKits.js'
import { readFile } from 'node:fs/promises'
import { composedBeat } from './fixtures/beat.mjs'

const originalWindow = globalThis.window
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalFetch = globalThis.fetch
const players = []
test('a new composition starts empty; no ready-made money-generating beat is supplied', () => {
  const {pattern}=initialComposition()
  assert.equal(Object.values(pattern.drums).flat().length,0)
  assert.equal(pattern.piano.length+pattern.melody.length,0)
})
afterEach(() => {
  players.forEach(p => p.dispose?.() ?? p.stop())
  players.length = 0
  globalThis.window = originalWindow
  Object.defineProperty(globalThis, 'navigator', originalNavigator)
  globalThis.fetch = originalFetch
})

function browser({ running = true, legacy = false } = {}) {
  const events = [], sources = [], contexts = [], requests = []
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } })
  const session = { _type: 'auto', get type() { return this._type }, set type(value) { this._type=value;events.push(value) } }
  class Context {
    constructor() { events.push('context');this.state='suspended';this.currentTime=0;this.sampleRate=44100;this.destination={};contexts.push(this) }
    resume() { events.push('resume');if(running)this.state='running';return Promise.resolve() }
    close() { this.state='closed';return Promise.resolve() }
    createGain() { return node() }
    createDynamicsCompressor() { return {...node(),threshold:{},knee:{},ratio:{}} }
    createBuffer(_channels,length) { return {duration:length/44100,getChannelData:()=>new Float32Array(length)} }
    decodeAudioData() { return Promise.resolve({duration:1}) }
    createBufferSource() { const source={...node(),playbackRate:{value:1},start(){sources.push(this)},stop(){this.stopped=true}};return source }
    createOscillator() { return {...this.createBufferSource(),frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}}} }
    createBiquadFilter() { return {...node(),frequency:{value:0}} }
  }
  class Media { constructor(){this.paused=true} play(){events.push('media-play');this.paused=false;return Promise.resolve()} pause(){this.paused=true} }
  globalThis.window={AudioContext:Context,Audio:Media}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:legacy?{}:{audioSession:session}})
  globalThis.fetch=async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}}
  const player=createBeatPlayer();players.push(player)
  return {player,events,sources,contexts,requests,session}
}

test('iPhone playback selects a music session synchronously before resuming audio', async () => {
  const {player,events,session}=browser()
  const started=player.play(composedBeat(),()=>{})
  assert.equal(events[0],'playback')
  assert.ok(events.includes('resume'))
  await started
  player.stop()
  assert.equal(session.type,'auto')
})

test('a suspended context reports an error instead of animating silent playback', async () => {
  const {player}=browser({running:false})
  let steps=0
  await assert.rejects(player.play(composedBeat(),()=>steps++),/звук|аудио/i)
  assert.equal(steps,0)
})

test('real samples load lazily once and stop/replay reuses the unlocked context', async () => {
  const {player,contexts,requests,sources}=browser()
  assert.equal(requests.length,0)
  await player.play(composedBeat(),()=>{})
  assert.equal(requests.length,5)
  assert.ok(requests.every(url=>url.endsWith('.wav')))
  assert.ok(sources.length>0)
  player.stop()
  assert.ok(sources.every(source=>source.stopped))
  await player.play(composedBeat(),()=>{})
  assert.equal(contexts.length,1)
  assert.equal(requests.length,5)
})

test('stopping during sample loading cannot start an old beat later', async () => {
  const {player,sources}=browser()
  let finish
  const response=new Promise(resolve=>finish=resolve)
  globalThis.fetch=()=>response
  const playing=player.play(composedBeat(),()=>{})
  player.stop()
  finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})
  await playing
  assert.equal(sources.length,0)
})

test('sample errors remain retryable and older browsers unlock media inside the tap', async () => {
  const {player,events}=browser({legacy:true})
  globalThis.fetch=async()=>({ok:false})
  const failed=player.play(composedBeat(),()=>{})
  assert.ok(events.includes('media-play'))
  await assert.rejects(failed,/загрузить|звук|сэмпл/i)
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})
  await player.play(composedBeat(),()=>{})
})

test('all three recorded sound kits fit the audio budget and contain non-silent PCM WAVs', async () => {
  assert.deepEqual(Object.keys(BEAT_KITS),['trap','plugg','cloud_rap'])
  const root=new URL('../public/audio/beatlab/',import.meta.url)
  const samples=JSON.parse(await readFile(new URL('sources.json',root),'utf8'))
  assert.equal(samples.length,15)
  assert.ok(samples.reduce((sum,sample)=>sum+sample.bytes,0)<1_000_000)
  for(const sample of samples) {
    const bytes=await readFile(new URL(sample.file,root))
    assert.equal(bytes.toString('ascii',0,4),'RIFF')
    assert.equal(bytes.toString('ascii',8,12),'WAVE')
    assert.equal(bytes.length,sample.bytes)
    assert.equal(bytes.readUInt16LE(22),1)
    assert.equal(bytes.readUInt16LE(34),16)
    assert.ok(bytes.subarray(44).some(byte=>byte!==0),sample.file)
    assert.equal(sample.license,'CC0-1.0')
  }
})
