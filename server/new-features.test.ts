import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { B3_LISTED_URL, StockDividendStore, issuerOf, parseListedCash, syncStockDividends } from './sources/b3-listed';
import { COTAHIST_NAME, pendingImports, readCotahistFile } from './sources/import';
import { DataHub } from './hub';
import { AlertService, collectEvents, parseTickers, toIcs, toRss } from './alerts';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'latin1');
const tmp = () => mkdtempSync(join(tmpdir(), 'nf-'));
/** Resposta no formato da B3 (valores sintéticos). */
const listed = (isin: string) => [{ code: 'PETR', cashDividends: [
  { assetIssued: isin, paymentDate: '21/12/2026', rate: '0,47000000000', relatedTo: 'Anual/2026', approvedOn: '06/08/2026', isinCode: isin, label: 'DIVIDENDO', lastDatePrior: '21/08/2026', remarks: '' },
  { assetIssued: isin, paymentDate: '23/11/2026', rate: '0,67000000000', relatedTo: 'Anual/2026', approvedOn: '06/08/2026', isinCode: isin, label: 'JRS CAP PROPRIO', lastDatePrior: '21/08/2026', remarks: '' },
  { assetIssued: 'BRPETRACNOR9', paymentDate: '', rate: '1,00', relatedTo: '', approvedOn: '', isinCode: 'BRPETRACNOR9', label: 'DIVIDENDO', lastDatePrior: '21/08/2026', remarks: '' },
  { assetIssued: isin, paymentDate: '', rate: 'abc', isinCode: isin, label: 'DIVIDENDO', lastDatePrior: '' },
] }];

describe('dividendos de ações (B3 — Empresas Listadas)', () => {
  it('lê eventos por ISIN, tipo, data-com e pagamento; descarta inválidos', () => {
    const ev = parseListedCash(listed('BRPETRACNPR6'));
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({ isin: 'BRPETRACNPR6', amount: 0.47, recordDate: '2026-08-21', paymentDate: '2026-12-21', kind: 'DIVIDENDO' });
    expect(ev[1].kind).toBe('JCP');
    expect(ev[2].paymentDate).toBeNull();
    expect(parseListedCash(JSON.stringify(listed('BRPETRACNPR6')))).toHaveLength(3); // JSON duplamente codificado
    expect(parseListedCash('não é json')).toEqual([]);
    expect(issuerOf('PETR4')).toBe('PETR');
    expect(issuerOf('MXRF11')).toBe('MXRF');
    expect(B3_LISTED_URL('PETR')).toContain(Buffer.from('{"issuingCompany":"PETR","language":"pt-br"}').toString('base64'));
  });
  it('sincroniza só as classes negociadas, com pausa e tolerância a falhas', async () => {
    const store = new StockDividendStore(join(tmp(), 's.json'));
    const fake = (async (u: string) => (u === B3_LISTED_URL('PETR') ? Response.json(listed('BRPETRACNPR6')) : new Response('x', { status: 500 }))) as unknown as typeof fetch;
    const r = await syncStockDividends(store, fake, [{ code: 'PETR', isins: ['BRPETRACNPR6'] }, { code: 'XXXX', isins: ['BRXXXXACNOR0'] }], { pauseMs: 0 });
    expect(r).toEqual({ ok: 1, failed: 1, events: 2 });
    expect(store.get('BRPETRACNPR6')).toHaveLength(2);
    expect(store.get('BRPETRACNOR9')).toHaveLength(0); // classe não pedida
  });
});

describe('proventos de ações: falha silenciosa vira erro visível', () => {
  it('centenas de emissores sem nenhum evento reconhecido → erro', async () => {
    const store = new StockDividendStore(join(tmp(), 's.json'));
    const fake = (async () => new Response(JSON.stringify([{ cashDividends: [] }]))) as unknown as typeof fetch;
    const issuers = Array.from({ length: 25 }, (_, i) => ({ code: `X${String(i).padStart(3, '0')}`, isins: [] }));
    await expect(syncStockDividends(store, fake, issuers, { pauseMs: 0 })).rejects.toThrow(/mudança no formato/);
  });
});

describe('importação manual de COTAHIST', () => {
  it('aceita só nomes oficiais; lê ZIP e TXT; detecta arquivos novos', () => {
    expect(COTAHIST_NAME.test('COTAHIST_D06112026.ZIP')).toBe(true);
    expect(COTAHIST_NAME.test('COTAHIST_M102026.zip')).toBe(true);
    expect(COTAHIST_NAME.test('outro.zip')).toBe(false);
    const txt = fx('cotahist-multi-2026-11-06.txt');
    const zip = zipSync({ 'COTAHIST_D06112026.TXT': strToU8(txt, true) });
    expect(readCotahistFile(zip, 'COTAHIST_D06112026.ZIP').length).toBe(9);
    const dir = tmp();
    writeFileSync(join(dir, 'COTAHIST_D06112026.ZIP'), zip);
    writeFileSync(join(dir, 'leia-me.txt'), 'x');
    const p = pendingImports(dir, {});
    expect(p.map((f) => f.name)).toEqual(['COTAHIST_D06112026.ZIP']);
    expect(pendingImports(dir, { 'COTAHIST_D06112026.ZIP': p[0].key })).toEqual([]);
  });
  it('central em modo padrão NÃO baixa da B3: só processa a pasta de importação', async () => {
    const dir = tmp();
    const calls: string[] = [];
    const fake = (async (u: string) => { calls.push(u); return new Response('[]', { status: 404 }); }) as unknown as typeof fetch;
    const hub = new DataHub({ dir: join(dir, 'cache'), importDir: join(dir, 'import'), fetchImpl: fake });
    await (hub as unknown as { step: (k: string, f: () => Promise<unknown>) => Promise<void>; updateQuotes: () => Promise<unknown> }).step('cotacoes', () => (hub as unknown as { updateQuotes: () => Promise<unknown> }).updateQuotes());
    expect(calls.filter((u) => u.includes('bmfbovespa.com.br/InstDados'))).toEqual([]);
    expect(hub.status().find((s) => s.key === 'cotacoes')?.lastError).toMatch(/Nenhuma cotação importada/);
    writeFileSync(join(dir, 'import', 'COTAHIST_D06112026.TXT'), fx('cotahist-multi-2026-11-06.txt'), 'latin1');
    await (hub as unknown as { step: (k: string, f: () => Promise<unknown>) => Promise<void>; updateQuotes: () => Promise<unknown> }).step('cotacoes', () => (hub as unknown as { updateQuotes: () => Promise<unknown> }).updateQuotes());
    expect(hub.status().find((s) => s.key === 'cotacoes')?.lastError).toBeNull();
    expect(hub.metrics('MXRF11')?.close).toBeCloseTo(9.1, 6);
    expect(calls.filter((u) => u.includes('InstDados'))).toEqual([]);
  });
});

describe('alertas sem custo', () => {
  const ev = [
    { ticker: 'MXRF11', amount: 0.095, recordDate: '2026-10-30', paymentDate: '2026-11-16', kind: 'Rendimento', source: 'Fundos.NET' },
    { ticker: 'PETR4', amount: 0.67, recordDate: '2026-08-21', paymentDate: null, kind: 'JCP', source: 'B3' },
  ];
  it('ICS válido (RFC 5545): eventos de dia inteiro para data-com e pagamento', () => {
    const s = toIcs(ev, new Date('2026-11-08T12:00:00Z'));
    expect(s.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(s.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect((s.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3); // MXRF: com + pagamento; PETR: só data-com
    expect(s).toContain('DTSTART;VALUE=DATE:20261116');
    expect(s).toContain('DTEND;VALUE=DATE:20261117');
    expect(s.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
  it('RSS com escape de XML', () => {
    expect(toIcs([{ ...ev[0], source: 'a;b,c' }])).toContain('a\\;b\\,c'); // RFC 5545: ; e , escapados
    const r = toRss([{ ...ev[0], source: 'A & B <c>' }], 'http://x');
    expect(r).toContain('<rss version="2.0">');
    expect(r).toContain('A &amp; B &lt;c&gt;');
  });
  it('tickers da URL são validados', () => {
    expect(parseTickers('mxrf11,PETR4,<script>,  ,HGLG11')).toEqual(['MXRF11', 'PETR4', 'HGLG11']);
  });
  it('Web Push e Telegram: só eventos novos; a 1ª passagem não dispara histórico; assinatura expirada é removida', async () => {
    const dir = tmp();
    const events: Record<string, { recordDate: string }[]> = { MXRF11: [{ recordDate: '2026-10-30' }] };
    const hub = { history: { meta: () => ({ cls: 'FII', isin: 'X' }) }, dividends: { get: (t: string) => (events[t] ?? []).map((e) => ({ amount: 0.1, paymentDate: '2026-11-16', ...e })) }, stockDivs: { get: () => [] } } as unknown as DataHub;
    const pushed: string[] = [];
    let fail410 = false;
    const tg: string[] = [];
    const svc = new AlertService(join(dir, 'a.json'), {
      send: (async (_s: unknown, payload: string) => { if (fail410) throw Object.assign(new Error('gone'), { statusCode: 410 }); pushed.push(payload); }) as never,
      telegram: { token: 'T', chatId: '1', tickers: ['MXRF11'] },
      fetchImpl: (async (_u: string, i: RequestInit) => { tg.push(String(i.body)); return new Response('{}'); }) as unknown as typeof fetch,
    });
    expect(svc.publicKey.length).toBeGreaterThan(40);
    expect(svc.subscribe({ subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } }, tickers: ['MXRF11'] })).toBeNull();
    expect(svc.subscribe({ subscription: { endpoint: 'javascript:x', keys: {} } })).toBe('Assinatura inválida');
    expect(await svc.notifyNew(hub)).toBe(0); // registra o histórico sem disparar
    events.MXRF11.push({ recordDate: '2026-11-30' });
    expect(await svc.notifyNew(hub)).toBe(2); // push + telegram
    expect(JSON.parse(pushed[0]).title).toContain('MXRF11');
    expect(tg[0]).toContain('30/11/2026');
    expect(await svc.notifyNew(hub)).toBe(0); // não repete
    events.MXRF11.push({ recordDate: '2026-12-30' });
    fail410 = true;
    await svc.notifyNew(hub);
    expect(svc.subscriptions).toBe(0);
    expect(collectEvents(hub, ['MXRF11'])[0].recordDate).toBe('2026-12-30');
  });
});
