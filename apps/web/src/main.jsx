import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { bootstrap } from './services/bootstrap.js';

// Run V3 runtime bootstrap BEFORE mounting React.
// Hydrates Tier 1 from IDB, elects master tab, starts integrity checks.
bootstrap().then(({ recovered, role }) => {
  console.log(`[main] Bootstrap complete — recovered=${recovered} role=${role}`);

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App recoveredFromIDB={recovered} tabRole={role} />
    </React.StrictMode>
  );
}).catch((err) => {
  console.error('[main] Fatal bootstrap error:', err);
  // Render app anyway so user sees something
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App recoveredFromIDB={false} tabRole="unknown" />
    </React.StrictMode>
  );
});
