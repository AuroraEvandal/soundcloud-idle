import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Telegram SDK: вне Telegram window.Telegram.WebApp отсутствует, это нормально.
const tg = window.Telegram?.WebApp
if (tg) {
  tg.ready()
  tg.expand()
}

createRoot(document.getElementById('root')).render(<App />)
