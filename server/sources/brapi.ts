/**
 * Cotações via brapi.dev com a CHAVE PESSOAL do próprio usuário, chamadas a partir do aparelho dele.
 * Termos da brapi: licença limitada e intransferível; vedado redistribuir/sublicenciar ou criar proxy/espelho
 * de acesso público. Por isso: a chave é do usuário, fica só no aparelho dele, e o app nunca repassa os dados.
 * Plano gratuito: 1 ticker por requisição e ~15 mil requisições/mês — buscamos só a lista de acompanhamento.
 */
import { saoPauloDate } from '../../src/engine/calendar';

export const BRAPI_URL = (ticker: string, token: string) => `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;

export interface BrapiQuote { ticker: string; price: number; high: number | null; low: number | null; volume: number | null; time: string; sessionDate: string }

export function parseBrapi(json: unknown, ticker: string): BrapiQuote | null {
  const r = (json as { results?: Record<string, unknown>[] })?.results?.[0];
  if (!r || String(r.symbol ?? '').toUpperCase() !== ticker) return null;
  const price = Number(r.regularMarketPrice);
  const time = String(r.regularMarketTime ?? '');
  if (!(price > 0) || Number.isNaN(Date.parse(time))) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { ticker, price, high: n(r.regularMarketDayHigh), low: n(r.regularMarketDayLow), volume: n(r.regularMarketVolume), time, sessionDate: saoPauloDate(new Date(time)) };
}

export async function fetchBrapiQuotes(fetchImpl: typeof fetch, token: string, tickers: string[], opts: { pauseMs?: number; maxRequests?: number; log?: (m: string) => void } = {}): Promise<{ quotes: BrapiQuote[]; errors: string[] }> {
  const quotes: BrapiQuote[] = [];
  const errors: string[] = [];
  for (const [i, t] of tickers.slice(0, opts.maxRequests ?? 60).entries()) {
    if (i) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 400));
    try {
      const res = await fetchImpl(BRAPI_URL(t, token), { headers: { Accept: 'application/json' } });
      const body = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) throw new Error(`chave recusada pela brapi (${(body as { message?: string })?.message ?? res.status})`);
      if (res.status === 429) { errors.push('limite de requisições do plano atingido'); break; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const q = parseBrapi(body, t);
      if (q) quotes.push(q); else errors.push(`${t}: resposta sem cotação`);
    } catch (e) {
      errors.push(`${t}: ${e instanceof Error ? e.message : e}`);
      if (String(e).includes('chave recusada')) break;
    }
  }
  return { quotes, errors };
}
