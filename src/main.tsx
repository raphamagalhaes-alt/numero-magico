import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Shell } from './ui/Shell';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installWebBackend } from './web/backend';

// Modo site: o "servidor" roda no navegador (dados do próprio usuário + dados abertos)
if (import.meta.env.VITE_WEB === '1') {
  installWebBackend();
  // instalável e utilizável offline (somente arquivos do próprio site ficam em cache)
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw-site.js').catch(() => undefined); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  </StrictMode>,
);
