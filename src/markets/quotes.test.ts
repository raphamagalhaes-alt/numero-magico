import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG, INDICES } from './catalog';
import { MONTHLY_BUDGET, changeOver, isStale, lastCloseMs, loadCache, refreshQuotes, type Quote } from './quotes';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
};
const q = (over: Partial<Quote> = {}): Quote => ({ price: 10, change: 0, changePct: 0, time: null, name: null, closes: [], histDay: null, fetchedAt: 0, ...over });
const ok = (price: number, hist = true) => new Response(JSON.stringify({ results: [{ regularMarketPrice: price, regularMarketChange: 0.5, regularMarketChangePercent: 1.25, regularMarketTime: '2026-11-06T21:00:00.000Z', longName: 'X', historicalDataPrice: hist ? [{ close: 8 }, { close: 9 }] : undefined }] }), { status: 200 });

beforeEach(() => store.clear());

describe('catálogo de mercados', () => {
  it('tem códigos únicos e válidos, com Brasil, FIIs, ETFs, EUA, Europa e Ásia', () => {
    const syms = CATALOG.map((i) => i.symbol);
    expect(new Set(syms).size).toBe(syms.length);
    expect(syms.every((s) => /^[A-Z0-9]{4,6}$/.test(s))).toBe(true);
    for (const r of ['BR', 'EUA', 'EUROPA', 'ASIA']) expect(CATALOG.some((i) => i.region === r)).toBe(true);
    expect(CATALOG.filter((i) => i.kind === 'ACAO').length).toBeGreaterThanOrEqual(40);
    expect(INDICES.map((i) => i.symbol)).toContain('^BVSP');
  });
});

describe('cotações (brapi, chave do usuário)', () => {
  it('fechamento: sexta 18h15 vale para o fim de semana; antes do pregão vale o dia útil anterior', () => {
    const sat = new Date('2026-11-07T15:00:00Z'); // sábado
    expect(new Date(lastCloseMs(sat)).toISOString()).toBe('2026-11-06T21:15:00.000Z');
    const monMorning = new Date('2026-11-09T11:00:00Z'); // segunda 8h BRT
    expect(new Date(lastCloseMs(monMorning)).toISOString()).toBe('2026-11-06T21:15:00.000Z');
    const monNight = new Date('2026-11-09T23:00:00Z');
    expect(new Date(lastCloseMs(monNight)).toISOString()).toBe('2026-11-09T21:15:00.000Z');
  });
  it('pregão aberto: atualiza a cada 30 min; fechado: só se for anterior ao último fechamento', () => {
    const open = new Date('2026-11-09T16:00:00Z'); // segunda 13h BRT
    expect(isStale(q({ fetchedAt: open.getTime() - 10 * 60_000 }), open)).toBe(false);
    expect(isStale(q({ fetchedAt: open.getTime() - 40 * 60_000 }), open)).toBe(true);
    const sat = new Date('2026-11-07T15:00:00Z');
    expect(isStale(q({ fetchedAt: Date.parse('2026-11-06T22:00:00Z') }), sat)).toBe(false);
    expect(isStale(q({ fetchedAt: Date.parse('2026-11-06T20:00:00Z') }), sat)).toBe(true);
    expect(isStale(undefined, sat)).toBe(true);
  });
  it('variação em 1 e 3 meses a partir do histórico', () => {
    const x = q({ price: 11, closes: [10, 10.5, 11, 10] });
    expect(changeOver(x, 3)).toBeCloseTo(0.1);
    expect(changeOver(x, 1)).toBeCloseTo(0);
    expect(changeOver(x, 99)).toBeCloseTo(0.1);
    expect(changeOver(q(), 1)).toBeNull();
  });
  it('envia a chave no cabeçalho (nunca na URL), guarda no aparelho e conta o uso do mês', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const f = (async (u: string, init?: RequestInit) => { seen.push({ url: String(u), auth: new Headers(init?.headers).get('authorization') }); return ok(10); }) as typeof fetch;
    const r = await refreshQuotes(['PETR4', 'AAPL34'], 'minha-chave', { fetchFn: f });
    expect(r.updated).toBe(2);
    expect(seen.every((s) => s.auth === 'Bearer minha-chave' && !s.url.includes('minha-chave') && s.url.includes('range=3mo'))).toBe(true);
    const c = loadCache();
    expect(c.used).toBe(2);
    expect(c.q.PETR4.changePct).toBeCloseTo(0.0125);
    expect(c.q.PETR4.closes).toEqual([8, 9]);
    // recém-buscado: não consulta de novo
    const again = await refreshQuotes(['PETR4'], 'minha-chave', { fetchFn: f });
    expect(again.updated + again.failed.length).toBe(0);
  });
  it('chave recusada interrompe; limite mensal de segurança é respeitado', async () => {
    const denied = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    const r = await refreshQuotes(['PETR4', 'VALE3', 'ITUB4'], 'x', { fetchFn: denied });
    expect(r.stopped).toMatch(/recusou a chave/);
    store.set('mxrf:markets', JSON.stringify({ q: {}, month: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7), used: MONTHLY_BUDGET }));
    let calls = 0;
    const r2 = await refreshQuotes(['PETR4'], 'x', { fetchFn: (async () => { calls++; return ok(1); }) as typeof fetch });
    expect(calls).toBe(0);
    expect(r2.stopped).toMatch(/Limite mensal/);
  });
});
