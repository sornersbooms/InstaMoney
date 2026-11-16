import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function boot() {
  // Fuera de Chrome (vista previa con `npm run dev`) se simula la API de la extensión con datos de ejemplo.
  if (import.meta.env.DEV && !globalThis.chrome?.storage) await import('./devMock');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
