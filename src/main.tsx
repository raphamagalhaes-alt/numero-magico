import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Shell } from './ui/Shell';
import { ErrorBoundary } from './ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  </StrictMode>,
);
