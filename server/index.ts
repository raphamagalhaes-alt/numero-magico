import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve, isAbsolute } from 'node:path';
import { ManualFileProvider } from './providers/manual';
import { HttpJsonProvider } from './providers/http-json';
import { OfficialB3FnetProvider } from './providers/official';
import type { MarketDataProvider } from './providers/types';
import { JsonStore } from './store';
import { MarketService, RefreshCooldownError } from './service';
import { nextNineAm, startDailyScheduler } from './scheduler';
import { learnHolidays, loadExtraHolidays } from './calendar';
import { createFetch } from './http';
import { ASSETS } from '../src/assets/registry';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
/** Por padrão escuta só localmente; em produção, atrás de proxy reverso, defina HOST=0.0.0.0 conscientemente. */
const HOST = process.env.HOST ?? '127.0.0.1';
const LEARNED = process.env.MARKET_LEARNED_HOLIDAYS_FILE ?? join(here, 'data', 'holidays-learned.json');
const DIST = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const REFRESH_TOKEN = process.env.REFRESH_TOKEN; // opcional: exige "Authorization: Bearer <token>" no POST /refresh
loadExtraHolidays(LEARNED);

const tickers = Object.keys(ASSETS);
const isTicker = (t: string) => Object.hasOwn(ASSETS, t);
const kind = process.env.MARKET_PROVIDER ?? (process.env.MARKET_PROVIDER_URL ? 'http' : 'official');
const httpFetch = createFetch();
const provider: MarketDataProvider =
  kind === 'manual' ? new ManualFileProvider(process.env.MARKET_MANUAL_FILE ?? join(here, 'data', 'market-manual.json'))
  : kind === 'http' ? new HttpJsonProvider(process.env.MARKET_PROVIDER_URL, process.env.MARKET_PROVIDER_TOKEN, process.env.MARKET_PROVIDER_NAME, httpFetch)
  : new OfficialB3FnetProvider({
      cnpjByTicker: Object.fromEntries(tickers.map((t) => [t, ASSETS[t].cnpj])),
      isinByTicker: Object.fromEntries(tickers.map((t) => [t, ASSETS[t].isin])),
      fetchImpl: httpFetch,
      onMissingSessions: (d) => {
        const c = learnHolidays(LEARNED, d);
        if (c.length) log('info', `dias sem pregão confirmados: ${c.join(', ')}`);
      },
    });
const store = new JsonStore(process.env.MARKET_STORE_FILE ?? join(here, 'data', 'market-store.json'));
const service = new MarketService(provider, store, undefined, Number(process.env.REFRESH_COOLDOWN_MS ?? 5 * 60 * 1000));

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console[level === 'info' ? 'log' : level](JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

let refreshingAll = false;
const refreshAll = async () => {
  if (refreshingAll) return; // evita execução sobreposta (carga inicial + agendador)
  refreshingAll = true;
  try {
    for (const t of tickers) {
      const s = await service.refresh(t);
      log(s.lastError ? 'warn' : 'info', `mercado ${t}`, { error: s.lastError });
    }
  } catch (e) {
    log('error', 'falha na atualização geral', { error: e instanceof Error ? e.message : String(e) });
  } finally { refreshingAll = false; }
};
if (provider.isConfigured() && process.env.DISABLE_SCHEDULER !== '1') {
  service.nextScheduledRun = () => nextNineAm(new Date());
  startDailyScheduler(refreshAll);
  if (provider.automatic && tickers.some((t) => !store.get(t).snapshot) && process.env.SKIP_INITIAL_REFRESH !== '1') void refreshAll();
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function json(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(pathname: string, res: ServerResponse, head: boolean): boolean {
  if (!existsSync(DIST)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const target = resolve(DIST, '.' + decoded);
  const rel = relative(DIST, target);
  if (rel.startsWith('..') || isAbsolute(rel)) return false; // fora de dist/
  let file = target;
  const isFile = existsSync(file) && statSync(file).isFile();
  if (!isFile) {
    if (extname(decoded)) { json(res, 404, { error: 'Arquivo não encontrado' }); return true; } // asset inexistente → 404 (não HTML)
    file = join(DIST, 'index.html'); // rota da SPA
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.includes(`${'/'}assets${'/'}`) ? 'public, max-age=31536000, immutable' : 'no-cache', ...SECURITY_HEADERS });
  res.end(head ? undefined : readFileSync(file));
  return true;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { return json(res, 400, { error: 'Requisição inválida' }); }
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, provider: provider.name, configured: provider.isConfigured() });
  if (url.pathname === '/api/assets') return json(res, 200, tickers.map((t) => ({ ticker: t, name: ASSETS[t].name })));
  const m = url.pathname.match(/^\/api\/market\/([A-Z0-9]{4,8})(\/refresh)?$/);
  if (m) {
    const ticker = m[1];
    if (!isTicker(ticker)) return json(res, 404, { error: `Ativo ${ticker} não cadastrado` });
    if (m[2]) {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' }, { Allow: 'POST' });
      // bloqueia POST de outros sites (CSRF): exige cabeçalho próprio, que força preflight CORS
      if (req.headers['x-requested-with'] !== 'mxrf11') return json(res, 403, { error: 'Requisição não autorizada' });
      if (REFRESH_TOKEN && req.headers.authorization !== `Bearer ${REFRESH_TOKEN}`) return json(res, 401, { error: 'Token inválido' });
      try {
        return json(res, 200, await service.manualRefresh(ticker));
      } catch (e) {
        if (e instanceof RefreshCooldownError) return json(res, 429, { ...service.status(ticker), error: e.message }, { 'Retry-After': String(e.retryAfterSeconds) });
        throw e;
      }
    }
    return json(res, 200, service.status(ticker));
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Rota não encontrada' });
  if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(url.pathname, res, req.method === 'HEAD')) return;
  json(res, 404, { error: 'Não encontrado' });
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    log('error', 'erro interno', { error: e instanceof Error ? e.stack : String(e), path: req.url });
    if (!res.headersSent) json(res, 500, { error: 'Erro interno do servidor' });
  });
}).listen(PORT, HOST, () => {
  log('info', `servidor em http://${HOST}:${PORT}`, { provider: provider.name, static: existsSync(DIST) });
});

process.on('unhandledRejection', (e) => log('error', 'promessa rejeitada sem tratamento', { error: e instanceof Error ? e.message : String(e) }));
