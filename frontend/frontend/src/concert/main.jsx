import { createRoot } from 'react-dom/client'
import Concert from './Concert.jsx'
import '../styles.css'

createRoot(document.getElementById('root')).render(<div className="ct-standalone"><Concert onClose={() => { window.location.href = '/' }} /></div>)
