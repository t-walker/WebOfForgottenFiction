import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { applyTheme } from './theme.ts';

// Before render, so the first paint is already on paper rather than flashing
// the stylesheet's fallback colours.
applyTheme(document.documentElement);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
