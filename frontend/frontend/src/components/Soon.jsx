// Метка для разделов, которых пока нет в docs/api.md (магазин, паки, запись и т.д.).
export default function Soon({ children = 'Скоро' }) {
  return <span className="soon">{children}</span>
}
