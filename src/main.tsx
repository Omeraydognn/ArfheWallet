import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.global = window;
  window.Buffer = window.Buffer || Buffer;
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'  // Initialize i18n before app renders
import './index.css'
import AppRouter from './AppRouter'
import { HashRouter } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'

import { ToastProvider } from './components/ToastProvider'

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
