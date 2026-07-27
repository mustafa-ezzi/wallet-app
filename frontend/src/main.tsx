import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getStoredTheme } from './theme/themes'
import { initAnalytics } from './lib/analytics'

applyTheme(getStoredTheme())
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
