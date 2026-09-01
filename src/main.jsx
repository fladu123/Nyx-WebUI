import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';

if (!window.NYX_CONFIG || typeof window.NYX_CONFIG.API_URL !== 'string') {
  throw new Error(
    'window.NYX_CONFIG.API_URL is not set — check that config.js is being ' +
    'served alongside index.html and loaded before the app bundle.'
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
