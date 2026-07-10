import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './lib/pwa'
import { ensureSeeded } from './db/seed'
import { backfillBaseAmounts } from './db/repo'

async function bootstrap() {
  try {
    await ensureSeeded()
    await backfillBaseAmounts()
  } catch (err) {
    console.error('Seeding failed', err)
  }
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}

void bootstrap()
