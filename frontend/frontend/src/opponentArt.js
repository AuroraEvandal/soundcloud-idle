export const OPPONENT_ART = {
  1: '/opponents/3got2010.png',
  2: '/opponents/arlekin40tysh.png',
  3: '/opponents/puzo80.png',
  4: '/opponents/xviiroyal.png',
  5: '/opponents/doom-rusha.png',
}

export const opponentArt = (id) => OPPONENT_ART[id] || null

const OPPONENT_PORTRAITS = {
  1: '/opponents/3got2010-cutout.png',
  2: '/opponents/arlekin40tysh-cutout.png',
  3: '/opponents/puzo80-cutout.png',
  4: '/opponents/xviiroyal-cutout.png',
  5: '/opponents/final-emblem.jpg',
}

export const opponentPortrait = (id, unlocked) =>
  Number(id) === 5 && !unlocked ? null : OPPONENT_PORTRAITS[id] || null
