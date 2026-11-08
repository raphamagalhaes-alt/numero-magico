/** Roteamento por hash (#/explorar?t=...), sem dependências e compatível com hospedagem estática. */
import { useEffect, useState } from 'react';

export type Page = 'simulador' | 'explorar' | 'comparar' | 'juros' | 'carteira' | 'dados' | 'termos';
export const PAGES: { id: Page; label: string }[] = [
  { id: 'simulador', label: 'Simulador' },
  { id: 'explorar', label: 'Explorar ativos' },
  { id: 'comparar', label: 'Comparar' },
  { id: 'juros', label: 'Juros e renda fixa' },
  { id: 'carteira', label: 'Minha carteira' },
  { id: 'dados', label: 'Status dos dados' },
];

export interface Route { page: Page; params: URLSearchParams }

export function parseHash(hash: string): Route {
  const [p, q] = hash.replace(/^#\/?/, '').split('?');
  const page = (PAGES.some((x) => x.id === p) || p === 'termos' ? p : 'simulador') as Page;
  return { page, params: new URLSearchParams(q ?? '') };
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parseHash(typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const on = () => setR(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function go(page: Page, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params)}` : '';
  window.location.hash = `#/${page}${q}`;
  window.scrollTo({ top: 0 });
}
