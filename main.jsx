import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';

// Fail loudly and visibly if public/config.js didn't load (e.g. wrong deploy
// path) instead of silently calling an undefined API URL everywhere.
if (!window.NYX_CONFIG || !window.NYX_CONFIG.API_URL) {
  throw new Error(
    'window.NYX_CONFIG.API_URL is not set — check that config.js is being ' +
    'served alongside index.html and loaded before the app bundle.'
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
