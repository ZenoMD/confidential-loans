import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import { App } from './App.tsx'
import { LedgerProvider } from './ledger.tsx'
import { ToastProvider } from './Toasts.tsx'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html is missing <div id="root">')

createRoot(root).render(
  <StrictMode>
    <LedgerProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LedgerProvider>
  </StrictMode>,
)
