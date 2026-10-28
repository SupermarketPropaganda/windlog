import React from 'react';
import ReactDOM from 'react-dom/client';
import PlusApp from './PlusApp';
import '../styles.css';
import './plus-styles.css';

// Register Service Worker for offline PWA cockpit use
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlusApp />
  </React.StrictMode>
);
