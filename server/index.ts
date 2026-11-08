import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';
import { ManualFileProvider } from './providers/manual';
import { HttpJsonProvider } from './providers/http-json';
import { OfficialB3FnetProvider } from './providers/official';
import type { MarketDataProvider } from './providers/types';
import { JsonStore } from './store';
import { MarketService } from './service';
import { nextNineAm, startDailyScheduler } from './scheduler';
import { learnHolidays, loadExtraHolidays } from './calendar';
import { createFetch } from './http';
import { ASSETS } from '../src/assets/registry';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const LEARNED = process.env.MARKET_LEARNED_HOLIDAYS_FILE ?? join(here, 'data', 'holidays-learned.json');
const DIST = process.env.STATIC_DIR ?? join(here, '..', 'dist');
loadExtraHolidays(LEARNED);

const tickers = Object.keys(ASSETS);
const kind = process.env.MARKET_PROVIDER ?? (process.env.MARKET_PROVIDER_URL ? 'http' : 'official');
const httpFetch = createFetch();
const provider: MarketDataProvider =
  kind === 'manual' ? new ManualFileProvider(process.env.MARKET_MANUAL_FILE ?? join(here, 'data', 'market-manual.json'))
  : kind === 'http' ? new HttpJsonProvider(process.env.MARKET_PROVIDER_URL, process.env.MARKET_PROVIDER_TOKEN, process.env.MARKET_PROVIDER_NAME, httpFetch)
  : new OfficialB3FnetProvider({
      cnpjByTicker: Object.fromEntries(tickers.map((t) => [t, ASSETS[t].cnpj])),
      fetchImpl: httpFetch,
      onMissingSessions: (d) => { learnHolidays(LEARNED, d); console.log(`[calendário] dias sem pregão aprendidos: ${d.join(', ')}`); },
    });
const store = new JsonStore(process.env.MARKET_STORE_FILE ?? join(here, 'data', 'market-store.json'));
const service = new MarketService(provider, store);

const refreshAll = async () => { for (const t of tickers) { const s = await service.refresh(t); console.log(`[mercado] ${t}: ${s.lastError ?? 'ok'}`); } };
if (provider.isConfigured() && process.env.DISABLE_SCHEDULER !== '1') {
  service.nextScheduledRun = () => nextNineAm(new Date());
  startDailyScheduler(refreshAll);
  // primeira carga ao iniciar, se não houver dado salvo
  if (provider.automatic && tickers.some((t) => !store.get(t).snapshot) && process.env.SKIP_INITIAL_REFRESH !== '1') void refreshAll();
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(DIST)) return false;
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) file = join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(readFileSync(file));
  return true;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, provider: provider.name, configured: provider.isConfigured() });
  if (url.pathname === '/api/assets') return json(res, 200, tickers.map((t) => ({ ticker: t, name: ASSETS[t].name })));
  const m = url.pathname.match(/^\/api\/market\/([A-Z0-9]{4,8})(\/refresh)?$/);
  if (m) {
    const ticker = m[1];
    if (!tickers.includes(ticker)) return json(res, 404, { error: `Ativo ${ticker} não cadastrado` });
    if (m[2]) {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
      return json(res, 200, await service.refresh(ticker));
    }
    return json(res, 200, service.status(ticker));
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Rota não encontrada' });
  if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
  json(res, 404, { error: 'Não encontrado' });
}

createServer((req, res) => {
  handle(req, res).catch((e) => json(res, 500, { error: String(e) }));
}).listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT} — provedor: ${provider.name}${existsSync(DIST) ? ' · servindo dist/' : ''}`);
});
