import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { App } from './App'

const root = document.getElementById('root')
if (root === null) throw new Error('kein #root im Dokument')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
