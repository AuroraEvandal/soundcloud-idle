import { initialComposition } from '../../src/beatAudio.js'

// Authored test data, never a preset offered to players.
export function composedBeat() {
  return {...initialComposition(), pattern:{
    drums:{kick:[0,6,16,22],snare:[4,12,20,28],hihat:[0,4,8,12,16,20,24,28]},
    piano:[{step:2,note:12},{step:18,note:15}],melody:[{step:10,note:19},{step:26,note:17}],
  }}
}
