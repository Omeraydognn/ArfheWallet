import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = window.Buffer || Buffer;
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import AppRouter from './AppRouter.jsx'
import { HashRouter } from 'react-router'

import { ToastProvider } from './components/ToastProvider.tsx'

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
)
