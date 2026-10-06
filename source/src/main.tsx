import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// Barlow ships inside the page (no Google Fonts request), so it renders everywhere.
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import './index.css';

// Load every weight up front so canvas labels (drawn at 600) never flash a fallback face.
for (const w of [400, 500, 600, 700]) document.fonts?.load(`${w} 12px Barlow`).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
