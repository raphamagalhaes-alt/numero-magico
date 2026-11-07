import type { MarketSnapshot, MarketStatus } from './types';

export class MarketApiError extends Error {}

async function call(path: string, init?: RequestInit): Promise<MarketStatus> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { Accept: 'application/json' } });
  } catch {
    throw new MarketApiError('Serviço de dados indisponível. Inicie o servidor (npm run server) ou use o modo manual.');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new MarketApiError('Serviço de dados não encontrado neste endereço (somente frontend publicado). Use o modo manual.');
  const body = await res.json();
  if (!res.ok) throw new MarketApiError(body?.error ?? `Erro HTTP ${res.status}`);
  return body as MarketStatus;
}

export const marketApi = {
  status: (ticker: string) => call(`/api/market/${ticker}`),
  refresh: (ticker: string) => call(`/api/market/${ticker}/refresh`, { method: 'POST' }),
};

/** Snapshot digitado pelo usuário no navegador (modo manual sem servidor). */
export function manualSnapshot(ticker: string, f: {
  price: string; tradedAt: string; priceSource: string;
  dividend: string; dividendKind: 'anunciado' | 'pago'; recordDate: string; paymentDate: string; dividendSource: string;
}): MarketSnapshot {
  const ev = { amountPerShare: f.dividend, recordDate: f.recordDate, paymentDate: f.paymentDate, source: f.dividendSource };
  return {
    ticker,
    provider: 'manual (navegador)',
    lastTrade: { price: f.price, tradedAt: f.tradedAt, source: f.priceSource },
    lastPaidDividend: f.dividendKind === 'pago' ? ev : null,
    lastAnnouncedDividend: f.dividendKind === 'anunciado' ? ev : null,
    fetchedAt: new Date().toISOString(),
  };
}
