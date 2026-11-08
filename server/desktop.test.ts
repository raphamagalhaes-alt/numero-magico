import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { BRAPI_URL, fetchBrapiQuotes, parseBrapi } from './sources/brapi';
import { SettingsStore } from './settings';
import { HistoryStore } from './sources/history';
import { parseCotahistAll } from './sources/cotahist';
import { DataHub } from './hub';

const tmp = () => mkdtempSync(join(tmpdir(), 'dk-'));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'brapi-quote-synthetic.json'), 'utf8'));

describe('brapi com a chave do próprio usuário', () => {
  it('lê o formato da API e valida o ticker', () => {
    expect(parseBrapi(fixture, 'PETR4')).toMatchObject({ ticker: 'PETR4', price: 40.5, sessionDate: '2026-11-06' });
    expect(parseBrapi(fixture, 'VALE3')).toBeNull();
    expect(parseBrapi({ results: [{ symbol: 'PETR4', regularMarketPrice: 0, regularMarketTime: 'x' }] }, 'PETR4')).toBeNull();
    expect(BRAPI_URL('PETR4', 'abc')).toBe('https://brapi.dev/api/quote/PETR4?token=abc');
  });
  it('1 ativo por requisição, limite máximo, para na chave recusada e no limite do plano', async () => {
    const calls: string[] = [];
    const ok = (async (u: string) => { calls.push(u); const t = u.split('/quote/')[1].split('?')[0]; return Response.json({ results: [{ ...fixture.results[0], symbol: t }] }); }) as unknown as typeof fetch;
    const r = await fetchBrapiQuotes(ok, 'tok', ['PETR4', 'VALE3', 'ITUB4'], { pauseMs: 0, maxRequests: 2 });
    expect(r.quotes.map((q) => q.ticker)).toEqual(['PETR4', 'VALE3']);
    expect(calls).toHaveLength(2);
    const denied = (async () => Response.json({ message: 'Token inválido' }, { status: 401 })) as unknown as typeof fetch;
    const d = await fetchBrapiQuotes(denied, 'x', ['PETR4', 'VALE3'], { pauseMs: 0 });
    expect(d.errors).toEqual(['PETR4: chave recusada pela brapi (Token inválido)']);
    const limited = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    expect((await fetchBrapiQuotes(limited, 'x', ['PETR4', 'VALE3'], { pauseMs: 0 })).errors).toEqual(['limite de requisições do plano atingido']);
  });
  it('configurações: chave validada, nunca exposta inteira, arquivo com permissão restrita', () => {
    const f = join(tmp(), 'settings.json');
    const s = new SettingsStore(f);
    s.update({ brapiToken: 'abcd1234efgh', watchlist: ['mxrf11', 'PETR4', '<x>', 'PETR4'] });
    expect(s.public()).toEqual({ brapiConfigured: true, brapiTokenHint: '…efgh', watchlist: ['MXRF11', 'PETR4'] });
    if (process.platform !== 'win32') expect(statSync(f).mode & 0o077).toBe(0);
    s.update({ brapiToken: 'curta' });
    expect(s.public().brapiConfigured).toBe(false);
  });
});

describe('fechamentos pessoais no histórico', () => {
  const base = parseCotahistAll(readFileSync(join(__dirname, 'fixtures', 'cotahist-multi-2026-11-06.txt'), 'latin1'));
  it('só atualiza ativos já conhecidos por um COTAHIST importado', () => {
    const h = new HistoryStore(join(tmp(), 'h.json'));
    h.addSession('2026-11-06', base);
    expect(h.addQuotes('2026-11-09', [{ ticker: 'PETR4', close: 41.1, volume: 1e6 }, { ticker: 'XPTO3', close: 1, volume: 1 }])).toEqual(['PETR4']);
    expect(h.points('PETR4').map((p) => p.close)).toEqual([40.5, 41.1]);
    expect(h.points('VALE3').map((p) => p.date)).toEqual(['2026-11-06']);
  });
  it('central: usa a chave só para a lista de acompanhamento e só com pregão encerrado', async () => {
    const dir = tmp();
    const calls: string[] = [];
    const fake = (async (u: string) => { calls.push(u); return Response.json({ results: [{ ...fixture.results[0], regularMarketPrice: 42, regularMarketTime: '2026-11-09T21:10:00.000Z' }] }); }) as unknown as typeof fetch;
    const hub = new DataHub({ dir: join(dir, 'c'), importDir: join(dir, 'i'), fetchImpl: fake, pauseMs: 0, now: () => new Date('2026-11-09T22:30:00Z'), personalQuotes: () => ({ token: 'tok123456', tickers: ['PETR4', 'NOVO3'] }) });
    hub.ingestRecords(base);
    const step = hub as unknown as { step: (k: string, f: () => Promise<unknown>) => Promise<void>; updateQuotes: () => Promise<unknown> };
    await step.step('cotacoes', () => step.updateQuotes());
    expect(calls.every((u) => u.startsWith('https://brapi.dev/api/quote/PETR4?token='))).toBe(true); // NOVO3 sem histórico: não consulta
    expect(hub.metrics('PETR4')?.close).toBe(42);
    expect(hub.metrics('PETR4')?.sessionDate).toBe('2026-11-09');
    expect(hub.quoteSourceOf('PETR4')?.source).toContain('chave pessoal');
    expect(calls.some((u) => u.includes('bmfbovespa'))).toBe(false); // nunca baixa COTAHIST
  });
});

/** Servidor real (processo separado) para testar o acesso pela rede com senha. */
describe('acesso pelo celular (rede local) com senha', () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  it.skipIf(!lan)('sem senha: 401; com senha: cookie e acesso; chave brapi não pode ser definida pela rede', async () => {
    const dir = tmp();
    const port = 8900 + Math.floor(Math.random() * 90);
    const token = 'senha-de-teste-1234567890';
    const p = spawn(process.execPath, ['--import', 'tsx', join(__dirname, 'index.ts')], {
      env: { ...process.env, PORT: String(port), HOST: '0.0.0.0', ACCESS_TOKEN: token, DATA_DIR: join(dir, 'd'), IMPORT_DIR: join(dir, 'i'), STATIC_DIR: join(dir, 'nada'), DISABLE_SCHEDULER: '1', SKIP_INITIAL_REFRESH: '1', MARKET_PROVIDER: 'manual', MARKET_STORE_FILE: join(dir, 's.json'), MARKET_LEARNED_HOLIDAYS_FILE: join(dir, 'l.json') },
      stdio: 'ignore',
    });
    try {
      const base = `http://${lan}:${port}`;
      for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
      expect((await fetch(`${base}/api/health`)).status).toBe(401);
      expect((await fetch(`${base}/api/health?acesso=errada`)).status).toBe(401);
      const r = await fetch(`${base}/?acesso=${token}`, { redirect: 'manual' });
      expect(r.status).toBe(302);
      const cookie = r.headers.get('set-cookie')!.split(';')[0];
      expect(cookie).toBe(`nm_access=${token}`);
      expect((await fetch(`${base}/api/universe`, { headers: { cookie } })).status).toBe(200);
      const set = await fetch(`${base}/api/settings`, { method: 'POST', headers: { cookie, 'X-Requested-With': 'mxrf11', 'Content-Type': 'application/json' }, body: JSON.stringify({ brapiToken: 'abcdefgh12345' }) });
      expect(set.status).toBe(403);
      expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200); // no próprio computador, sem senha
    } finally { p.kill(); }
  }, 30000);
});
