import { createRoot } from 'react-dom/client'
import Concert from './Concert.jsx'
import '../styles.css'

const telegram = window.Telegram?.WebApp
telegram?.ready()
telegram?.expand()

createRoot(document.getElementById('root')).render(<div className="ct-standalone"><Concert onClose={() => { window.location.href = '/' }} /></div>)
