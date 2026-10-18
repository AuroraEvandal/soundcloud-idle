// Плоские иконки без теней и градиентов.
const P = {
  cloud: { fill: true, d: 'M7.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18.4 9a5 5 0 0 1 .1 10Z' },
  mic: {
    d: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6',
  },
  cards: { d: 'M7 5h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM19 8l1.5 9.5M3.5 8' },
  plane: { fill: true, d: 'M21.5 3.5 2.8 10.7l5.4 2.1 2.1 6.4 3.1-4.2 4.6 3.5Z' },
  person: { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0' },
  cart: { d: 'M3 4h2.5l2.2 11h9.6l2-8H6.5M9.5 20h.01M16.5 20h.01' },
  back: { d: 'M15 5 8 12l7 7' },
  send: { fill: true, d: 'M3 11.5 21 3l-4 18-5.5-5-3 3.5v-5.5L17 7l-9 6.5Z' },
  compose: { d: 'M5 5h8M5 5v14h14v-8M17.5 3.5l3 3L12 15l-4 1 1-4Z' },
  lock: { d: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6Z' },
  headphones: { d: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1Zm16 0h-3v5h2a1 1 0 0 0 1-1Z' },
  hat: { d: 'M4 15a8 8 0 0 1 16 0M2 15h20v2H2Z' },
  hoodie: { d: 'M8 4 4 7v5l3 1v7h10v-7l3-1V7l-4-3-4 3Z' },
  pants: { d: 'M7 3h10l1 18h-4l-2-9-2 9H6Z' },
  shoe: { d: 'M3 16c4 0 5-3 6-6l3 2h3l4 3v3H3Z' },
  chain: { d: 'M6 5c0 8 2.5 12 6 12s6-4 6-12M12 17v3' },
  box: { d: 'M4 8l8-4 8 4v9l-8 4-8-4ZM4 8l8 4 8-4M12 12v9' },
  help: { d: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5h.01' },
  check: { d: 'M5 12.5 10 17.5 19 7.5' },
}

export default function Icon({ name, size = 24, color = 'currentColor', stroke = 2 }) {
  const p = P[name]
  if (!p) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={p.fill ? color : 'none'}
      stroke={p.fill ? 'none' : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={p.d} />
    </svg>
  )
}
