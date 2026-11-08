import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Shell } from './ui/Shell';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installWebBackend } from './web/backend';

// Modo site: o "servidor" roda no navegador (dados do próprio usuário + dados abertos)
if (import.meta.env.VITE_WEB === '1') installWebBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  </StrictMode>,
);
