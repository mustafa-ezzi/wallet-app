import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bootAnalytics } from './analytics'
import './styles.css'
import './polish.css'
bootAnalytics()
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
