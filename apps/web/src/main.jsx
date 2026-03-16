/* eslint-disable no-unused-vars */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { bootstrap } from './services/bootstrap.js';
import './index.css';

function mountApp(recovered = false, role = 'unknown') {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App recoveredFromIDB={recovered} tabRole={role} />
    </React.StrictMode>
  );
}

// Race bootstrap against a 3-second timeout so the UI never hangs blank
const bootstrapTimeout = new Promise((resolve) =>
  setTimeout(() => resolve({ recovered: false, role: 'unknown' }), 3000)
);

Promise.race([bootstrap(), bootstrapTimeout])
  .then(({ recovered, role }) => {
    console.log(`[main] Bootstrap complete — recovered=${recovered} role=${role}`);
    mountApp(recovered, role);
  })
  .catch((err) => {
    console.error('[main] Fatal bootstrap error:', err);
    mountApp(false, 'unknown');
  });
