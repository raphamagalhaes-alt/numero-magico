import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from './store';
import { MarketService, RefreshCooldownError } from './service';
import { learnHolidays } from './calendar';
import { isTradingDay } from '../src/engine/calendar';
import type { MarketDataProvider } from './providers/types';
import type { MarketSnapshot } from '../src/market/types';

const tmp = () => mkdtempSync(join(tmpdir(), 'mxrf-svc-'));
const snap = (price: string, over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  ticker: 'MXRF11', provider: 't', fetchedAt: '2026-11-08T12:00:00Z',
  lastTrade: { price, tradedAt: '2026-11-06T18:00:00-03:00', sessionDate: '2026-11-06', source: 'B3', sourceUrl: 'https://b3' },
  lastPaidDividend: { amountPerShare: '0.1', recordDate: '2026-09-30', paymentDate: '2026-10-15', source: 'F' },
  lastAnnouncedDividend: null, ...over,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function provider(fn: () => Promise<MarketSnapshot>): MarketDataProvider & { calls: number } {
  const p = { name: 't', automatic: true, calls: 0, isConfigured: () => true, fetchSnapshot: async () => { p.calls++; return fn(); } };
  return p;
}

describe('MarketService — concorrência, intervalo mínimo e merge parcial', () => {
  it('chamadas simultâneas compartilham uma única consulta', async () => {
    const p = provider(async () => { await sleep(30); return snap('9.00'); });
    const svc = new MarketService(p, new JsonStore(join(tmp(), 's.json')));
    const [a, b] = await Promise.all([svc.refresh('MXRF11'), svc.refresh('MXRF11')]);
    expect(p.calls).toBe(1);
    expect(a.snapshot?.lastTrade?.price).toBe('9.00');
    expect(b.snapshot?.lastTrade?.price).toBe('9.00');
  });
  it('falha tardia não sobrescreve dado novo gravado por outra atualização', async () => {
    const store = new JsonStore(join(tmp(), 's.json'));
    store.set('MXRF11', { snapshot: snap('5.00'), lastAttemptAt: null, lastError: null });
    const slowFail = new MarketService(provider(async () => { await sleep(60); throw new Error('timeout'); }), store);
    const fastOk = new MarketService(provider(async () => { await sleep(10); return snap('9.00'); }), store);
    await Promise.all([slowFail.refresh('MXRF11'), fastOk.refresh('MXRF11')]);
    expect(store.get('MXRF11').snapshot?.lastTrade?.price).toBe('9.00');
  });
  it('atualização manual respeita intervalo mínimo (429)', async () => {
    let now = new Date('2026-11-08T12:00:00Z');
    const svc = new MarketService(provider(async () => snap('9.00')), new JsonStore(join(tmp(), 's.json')), () => now, 60_000);
    await svc.manualRefresh('MXRF11');
    await expect(svc.manualRefresh('MXRF11')).rejects.toBeInstanceOf(RefreshCooldownError);
    now = new Date('2026-11-08T12:01:01Z');
    await expect(svc.manualRefresh('MXRF11')).resolves.toBeTruthy();
  });
  it('falha parcial mantém os rendimentos anteriores e registra o aviso', async () => {
    const store = new JsonStore(join(tmp(), 's.json'));
    store.set('MXRF11', { snapshot: snap('8.80', { lastAnnouncedDividend: { amountPerShare: '0.095', recordDate: '2026-10-30', paymentDate: '2026-11-16', source: 'F' } }), lastAttemptAt: null, lastError: null });
    const svc = new MarketService(provider(async () => snap('9.10', { lastPaidDividend: null, partial: { trade: true, dividends: false }, partialErrors: ['rendimentos (Fundos.NET): HTTP 503'] })), store);
    const st = await svc.refresh('MXRF11');
    expect(st.snapshot?.lastTrade?.price).toBe('9.10');
    expect(st.snapshot?.lastAnnouncedDividend?.amountPerShare).toBe('0.095');
    expect(st.lastError).toMatch(/Falha parcial/);
    expect(st.snapshot).not.toHaveProperty('partialErrors');
  });
  it('rejeita link de fonte que não seja https', async () => {
    const svc = new MarketService(provider(async () => snap('9.00', { lastTrade: { price: '9.00', tradedAt: '2026-11-06T18:00:00-03:00', source: 'x', sourceUrl: 'javascript:alert(1)' } })), new JsonStore(join(tmp(), 's.json')));
    expect((await svc.refresh('MXRF11')).lastError).toMatch(/link/);
  });
});

describe('JsonStore e feriados aprendidos', () => {
  it('arquivo com null ou lixo não derruba o serviço', () => {
    const f = join(tmp(), 's.json');
    writeFileSync(f, 'null');
    expect(new JsonStore(f).get('MXRF11').snapshot).toBeNull();
    writeFileSync(f, '{"MXRF11": null, "constructor": 1}');
    const s = new JsonStore(f);
    expect(s.get('MXRF11').snapshot).toBeNull();
    expect(s.get('constructor').snapshot).toBeNull();
  });
  it('dia sem arquivo só é confirmado como sem pregão na 2ª observação, em outro dia', () => {
    const f = join(tmp(), 'learned.json');
    expect(learnHolidays(f, ['2032-06-09'], new Date('2032-06-14T12:00:00Z'))).toEqual([]);
    expect(isTradingDay('2032-06-09')).toBe(true);
    expect(learnHolidays(f, ['2032-06-09'], new Date('2032-06-14T20:00:00Z'))).toEqual([]); // mesmo dia
    expect(learnHolidays(f, ['2032-06-09'], new Date('2032-06-15T12:00:00Z'))).toEqual(['2032-06-09']);
    expect(isTradingDay('2032-06-09')).toBe(false);
  });
});
