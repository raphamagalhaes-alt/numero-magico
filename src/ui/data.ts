/** Acesso aos dados oficiais servidos pela API, com cache em memória e estados de carregamento/erro. */
import { useEffect, useState } from 'react';
import type { AssetDetail, DatasetStatus, GlobalRatesResponse, MacroResponse, UniverseResponse } from '../market/universe';

const cache = new Map<string, { at: number; p: Promise<unknown> }>();
const TTL = 30_000;
const listeners = new Set<() => void>();
/** Descarta dados em memória (após importar cotações, salvar chave etc.) e avisa as telas abertas. */
export function invalidateData() { cache.clear(); for (const l of listeners) l(); }
// modo site: cotações que chegam em segundo plano (chave brapi) atualizam a tela sozinhas
if (typeof window !== 'undefined') window.addEventListener('nm:data-updated', () => invalidateData());

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { headers: { Accept: 'application/json' } }); }
  catch { throw new Error('Serviço de dados indisponível. Inicie o servidor (npm run server).'); }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Serviço de dados não encontrado neste endereço.');
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Erro HTTP ${res.status}`);
  return body as T;
}

export function fetchCached<T>(path: string, force = false): Promise<T> {
  const hit = cache.get(path);
  if (force || !hit || Date.now() - hit.at > TTL) {
    const p = getJson<T>(path);
    cache.set(path, { at: Date.now(), p });
    p.catch(() => cache.delete(path));
  }
  return cache.get(path)!.p as Promise<T>;
}

export interface Remote<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

export function useRemote<T>(path: string | null): Remote<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: Boolean(path) });
  const [nonce, setNonce] = useState(0);
  useEffect(() => { const l = () => setNonce((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchCached<T>(path, nonce > 0).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }),
    );
    return () => { alive = false; };
  }, [path, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

export const useUniverse = () => useRemote<UniverseResponse>('/api/universe');
export const useMacro = () => useRemote<MacroResponse>('/api/macro');
export const useGlobalRates = () => useRemote<GlobalRatesResponse>('/api/rates/global');
export const useDataStatus = () => useRemote<DatasetStatus[]>('/api/data/status');
export const useAssetDetail = (t: string | null) => useRemote<AssetDetail>(t ? `/api/asset/${t}` : null);
