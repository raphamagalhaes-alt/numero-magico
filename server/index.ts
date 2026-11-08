import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { COTAHIST_NAME, readCotahistFile } from './sources/import';
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
import { D } from '../src/engine/decimal';
import { SettingsStore } from './settings';
import { timingSafeEqual } from 'node:crypto';
import { DataHub } from './hub';
import { EVENING_CRON } from './scheduler';
import { AlertService, alertsPath, collectEvents, parseTickers, toIcs, toRss } from './alerts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
/** Por padrão escuta só localmente; em produção, atrás de proxy reverso, defina HOST=0.0.0.0 conscientemente. */
const HOST = process.env.HOST ?? '127.0.0.1';
const LEARNED = process.env.MARKET_LEARNED_HOLIDAYS_FILE ?? join(here, 'data', 'holidays-learned.json');
const DIST = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const REFRESH_TOKEN = process.env.REFRESH_TOKEN; // opcional: exige "Authorization: Bearer <token>" no POST /refresh
loadExtraHolidays(LEARNED);

const tickers = Object.keys(ASSETS);
const DATA_DIR = process.env.DATA_DIR ?? join(here, 'data', 'cache');
/** Somente com autorização/contrato da B3: a página de Cotações Históricas proíbe coleta automatizada. */
const B3_AUTHORIZED = process.env.B3_MARKET_DATA_AUTHORIZED === '1';
/** Exposição pública sem autorização: dados da B3 não são servidos (Termos de Uso: uso exclusivamente pessoal). */
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
/**
 * Acesso pelo celular na rede de casa (uso pessoal do mesmo usuário): exige ACCESS_TOKEN em toda
 * requisição que não venha do próprio computador. Sem token, o servidor só aceita acesso local.
 */
const ACCESS_TOKEN = process.env.ACCESS_TOKEN && process.env.ACCESS_TOKEN.length >= 16 ? process.env.ACCESS_TOKEN : null;
const B3_PUBLIC_BLOCK = !LOOPBACK && !B3_AUTHORIZED && process.env.B3_PERSONAL_USE_ACK !== '1' && !ACCESS_TOKEN;
const settings = new SettingsStore(join(DATA_DIR, 'settings.json'));
const hub = new DataHub({
  dir: DATA_DIR,
  personalQuotes: () => ({ token: process.env.BRAPI_TOKEN ?? settings.s.brapiToken, tickers: settings.s.watchlist }),
  b3AutomatedDownload: B3_AUTHORIZED,
  importDir: process.env.IMPORT_DIR ?? join(here, 'data', 'import'),
  fetchImpl: createFetch(),
  historyMonths: Number(process.env.HISTORY_MONTHS ?? 13),
  dividendBackfillDays: Number(process.env.DIVIDEND_BACKFILL_DAYS ?? 400),
  log: (m) => log('info', m),
});
/** Cadastro fixo (com demonstração) + qualquer FII/Fiagro do universo com CNPJ conhecido pela CVM. */
const isStock = (t: string) => hub.history.meta(t)?.cls === 'ACAO';
const isTicker = (t: string) => Object.hasOwn(ASSETS, t) || Boolean(hub.cnpjOf(t)) || isStock(t);
const kind = process.env.MARKET_PROVIDER ?? (process.env.MARKET_PROVIDER_URL ? 'http' : 'official');
const httpFetch = createFetch();
const provider: MarketDataProvider =
  kind === 'manual' ? new ManualFileProvider(process.env.MARKET_MANUAL_FILE ?? join(here, 'data', 'market-manual.json'))
  : kind === 'http' ? new HttpJsonProvider(process.env.MARKET_PROVIDER_URL, process.env.MARKET_PROVIDER_TOKEN, process.env.MARKET_PROVIDER_NAME, httpFetch)
  : new OfficialB3FnetProvider({
      cnpjByTicker: Object.fromEntries(tickers.map((t) => [t, ASSETS[t].cnpj])),
      isinByTicker: Object.fromEntries(tickers.map((t) => [t, ASSETS[t].isin])),
      fetchImpl: httpFetch,
      resolve: (t) => ({ cnpj: hub.cnpjOf(t), isin: hub.isinOf(t) }),
      automatedQuotes: B3_AUTHORIZED,
      localTrade: (t) => {
        const pts = hub.history.points(t);
        const p = pts[pts.length - 1];
        const src = hub.quoteSourceOf(t);
        return p ? { price: p.close.toFixed(2), sessionDate: p.date, tradedAt: `${p.date}T18:00:00-03:00`, kind: 'fechamento', source: src?.date === p.date ? `Fechamento via ${src.source}` : 'B3 — arquivo COTAHIST importado pelo usuário (fechamento do pregão)' } : null;
      },
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
const alerts = new AlertService(alertsPath(DATA_DIR), {
  subject: process.env.VAPID_SUBJECT ?? 'mailto:alertas@localhost',
  fetchImpl: createFetch(),
  telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, tickers: parseTickers(process.env.TELEGRAM_TICKERS ?? '') } : null,
  log: (m) => log('warn', m),
});
const runHub = async () => {
  try {
    await hub.updateAll();
    const n = await alerts.notifyNew(hub);
    if (n) log('info', `alertas enviados: ${n}`);
  } catch (e) { log('error', 'central de dados', { error: e instanceof Error ? e.message : String(e) }); }
};
if (process.env.DISABLE_SCHEDULER !== '1') {
  startDailyScheduler(runHub, (m) => log('info', m), undefined, 'central-dados-manha');
  startDailyScheduler(runHub, (m) => log('info', m), EVENING_CRON, 'central-dados-noite');
  if (process.env.SKIP_INITIAL_REFRESH !== '1' && process.env.MARKET_PROVIDER !== 'manual') void runHub();
}
if (provider.isConfigured() && process.env.DISABLE_SCHEDULER !== '1') {
  service.nextScheduledRun = () => nextNineAm(new Date());
  startDailyScheduler(refreshAll);
  startDailyScheduler(refreshAll, (m) => log('info', m), EVENING_CRON, 'atualizacao-noite-mercado');
  if (provider.automatic && tickers.some((t) => !store.get(t).snapshot) && process.env.SKIP_INITIAL_REFRESH !== '1') void refreshAll();
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function json(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
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

const isLocal = (req: IncomingMessage) => { const r = req.socket.remoteAddress ?? ''; return r === '127.0.0.1' || r === '::1' || r === '::ffff:127.0.0.1'; };
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function hasAccess(req: IncomingMessage, url: URL): boolean {
  if (isLocal(req)) return true;
  if (!ACCESS_TOKEN) return LOOPBACK ? false : true; // servidor público: as regras de dados abaixo se aplicam
  const cookie = /(?:^|;\s*)nm_access=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
  const q = url.searchParams.get('acesso') ?? '';
  return safeEq(cookie, ACCESS_TOKEN) || safeEq(q, ACCESS_TOKEN);
}

async function readJson(req: IncomingMessage, max = 20000): Promise<unknown> {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > max) throw new Error('Corpo grande demais'); }
  return JSON.parse(raw);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { return json(res, 400, { error: 'Requisição inválida' }); }
  if (ACCESS_TOKEN && !isLocal(req)) {
    if (!hasAccess(req, url)) return json(res, 401, { error: 'Acesso restrito: abra o link com a senha de acesso exibida no app do computador.' });
    if (url.searchParams.get('acesso')) { // grava cookie e remove a senha da URL
      res.writeHead(302, { Location: url.pathname === '/' ? '/' : url.pathname, 'Set-Cookie': `nm_access=${ACCESS_TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, ...SECURITY_HEADERS });
      return res.end();
    }
  }
  if (url.pathname === '/api/settings') {
    if (!isLocal(req) && !ACCESS_TOKEN) return json(res, 403, { error: 'Configurações só no próprio computador.' });
    if (req.method === 'POST') {
      if (req.headers['x-requested-with'] !== 'mxrf11') return json(res, 403, { error: 'Requisição não autorizada' });
      let body: { brapiToken?: string | null; watchlist?: unknown };
      try { body = (await readJson(req)) as typeof body; } catch { return json(res, 400, { error: 'JSON inválido' }); }
      // a chave brapi só pode ser definida no próprio computador (nunca pela rede)
      if (body.brapiToken !== undefined && !isLocal(req)) return json(res, 403, { error: 'Defina a chave brapi no computador.' });
      settings.update(body);
      if (body.brapiToken) void runHub();
    }
    return json(res, 200, settings.public());
  }
  if (url.pathname === '/api/import/scan' && req.method === 'POST') {
    if (!isLocal(req) || req.headers['x-requested-with'] !== 'mxrf11') return json(res, 403, { error: 'Somente local' });
    void runHub();
    return json(res, 202, { ok: true });
  }
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, provider: provider.name, configured: provider.isConfigured() });
  if (url.pathname === '/api/assets') return json(res, 200, tickers.map((t) => ({ ticker: t, name: ASSETS[t].name })));
  if (url.pathname === '/api/alerts/calendar.ics' || url.pathname === '/api/alerts/feed.xml') {
    if (B3_PUBLIC_BLOCK) return json(res, 451, { error: 'Alertas com dados da B3 indisponíveis em servidor público sem autorização da B3.' });
    const evs = collectEvents(hub, parseTickers(url.searchParams.get('t')));
    const ics = url.pathname.endsWith('.ics');
    res.writeHead(200, { 'Content-Type': ics ? 'text/calendar; charset=utf-8' : 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...SECURITY_HEADERS, ...(ics ? { 'Content-Disposition': 'inline; filename="proventos.ics"' } : {}) });
    return res.end(ics ? toIcs(evs) : toRss(evs, `http://${req.headers.host ?? 'localhost'}`));
  }
  if (url.pathname === '/api/push/key') return json(res, 200, { publicKey: alerts.publicKey });
  if ((url.pathname === '/api/push/subscribe' || url.pathname === '/api/push/unsubscribe') && req.method === 'POST') {
    if (req.headers['x-requested-with'] !== 'mxrf11') return json(res, 403, { error: 'Requisição não autorizada' });
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 20000) return json(res, 413, { error: 'Corpo grande demais' }); }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'JSON inválido' }); }
    if (url.pathname.endsWith('unsubscribe')) { alerts.unsubscribe(String((body as { endpoint?: string })?.endpoint ?? '')); return json(res, 200, { ok: true }); }
    const err = alerts.subscribe(body);
    return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/compliance') return json(res, 200, { b3Authorized: B3_AUTHORIZED, b3PublicBlock: B3_PUBLIC_BLOCK, importDir: hub.importDir, automatedQuotes: hub.automatedQuotes });
  if (url.pathname === '/api/import/cotahist' && req.method === 'POST') return handleImport(req, res);
  if (B3_PUBLIC_BLOCK && /^\/api\/(universe|asset\/|market\/)/.test(url.pathname))
    return json(res, 451, { error: 'Dados da B3 indisponíveis neste servidor público: os Termos de Uso da B3 permitem uso exclusivamente pessoal; a publicação exige autorização prévia e por escrito da B3 (contrato de distribuição de market data).' });
  if (url.pathname === '/api/universe') {
    // sem cache temporal: após uma importação o universo muda na hora; ETag evita reenviar o mesmo conteúdo
    const u = hub.universe();
    const etag = `"${u.asOf}-${u.sessions}-${u.assets.length}-${u.dividendsCoverageFrom}-${hub.status().map((s) => s.lastSuccess).join('|').length}-${hub.version}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS }); return res.end(); }
    return json(res, 200, u, { ETag: etag, 'Cache-Control': 'no-cache' });
  }
  if (url.pathname === '/api/macro') return json(res, 200, hub.macro() ?? { indicators: [], tesouro: { baseDate: null, bonds: [], source: '', sourceUrl: '' } });
  if (url.pathname === '/api/rates/global') return json(res, 200, hub.global() ?? { rates: [] });
  if (url.pathname === '/api/data/status') return json(res, 200, hub.status());
  const am = url.pathname.match(/^\/api\/asset\/([A-Z0-9]{4,8})$/);
  if (am) { const d = hub.detail(am[1]); return d ? json(res, 200, d) : json(res, 404, { error: 'Ativo sem dados' }); }
  const m = url.pathname.match(/^\/api\/market\/([A-Z0-9]{4,8})(\/refresh)?$/);
  if (m) {
    const ticker = m[1];
    if (!isTicker(ticker)) return json(res, 404, { error: `Ativo ${ticker} não cadastrado` });
    if (isStock(ticker)) return json(res, 200, stockStatus(ticker));
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

/**
 * Ação: proventos irregulares (dividendos/JCP) viram uma média mensal dos últimos 12 meses para o
 * modelo mensal do simulador, com a fonte e a natureza (média, bruta) explícitas.
 */
function stockStatus(ticker: string) {
  const m = hub.metrics(ticker)!;
  const ev = hub.stockDivs.get(m.isin);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const win = ev.filter((e) => e.recordDate > from && e.recordDate <= today);
  // soma e média em aritmética decimal (evita 2,40/12 = 0,199999 por ponto flutuante)
  const sumD = win.reduce((a, e) => a.add(String(e.amount)), new D(0));
  const sum = sumD.toNumber();
  const last = ev[ev.length - 1];
  const monthly = sumD.div(12).toDecimalPlaces(6, D.ROUND_DOWN);
  return {
    ticker, lastAttemptAt: null, lastError: win.length ? null : 'Sem proventos com data-com nos últimos 12 meses (B3 — Empresas Listadas).',
    stale: false, providerConfigured: true, providerName: 'B3 — Empresas Listadas + COTAHIST importado', automaticUpdates: true, nextScheduledRun: null,
    snapshot: {
      ticker, provider: 'B3 (uso pessoal)', fetchedAt: hub.status().find((s) => s.key === 'acoes')?.lastSuccess ?? new Date().toISOString(),
      lastTrade: { price: m.close.toFixed(2), sessionDate: m.sessionDate, tradedAt: `${m.sessionDate}T18:00:00-03:00`, kind: 'fechamento', source: 'B3 — arquivo COTAHIST importado pelo usuário' },
      lastPaidDividend: win.length ? {
        amountPerShare: monthly.toFixed(), recordDate: last.recordDate, paymentDate: last.paymentDate ?? last.recordDate,
        referencePeriod: `média mensal de ${win.length} proventos em 12 meses (R$ ${sum.toFixed(4)}/ação, dividendos + JCP brutos)`,
        source: 'B3 — Empresas Listadas (proventos em dinheiro)',
      } : null,
      lastAnnouncedDividend: null,
    },
  };
}

/** Upload de arquivo COTAHIST baixado manualmente (somente acesso local ou com token). */
async function handleImport(req: IncomingMessage, res: ServerResponse) {
  const remote = req.socket.remoteAddress ?? '';
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!local && !(REFRESH_TOKEN && req.headers.authorization === `Bearer ${REFRESH_TOKEN}`)) return json(res, 403, { error: 'Importação permitida apenas localmente.' });
  if (req.headers['x-requested-with'] !== 'mxrf11') return json(res, 403, { error: 'Requisição não autorizada' });
  const name = String(req.headers['x-file-name'] ?? '');
  if (!COTAHIST_NAME.test(name)) return json(res, 400, { error: 'Nome de arquivo inválido: use o arquivo original (COTAHIST_Dddmmaaaa.ZIP, COTAHIST_Mmmaaaa.ZIP ou COTAHIST_Aaaaa.ZIP).' });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 200 * 1024 * 1024) return json(res, 413, { error: 'Arquivo grande demais (máx. 200 MB).' }); chunks.push(c as Buffer); }
  try {
    const recs = readCotahistFile(new Uint8Array(Buffer.concat(chunks)), name);
    if (!recs.length) return json(res, 400, { error: 'Nenhum registro de cotação reconhecido no arquivo.' });
    const sessions = hub.ingestRecords(recs);
    mkdirSync(hub.importDir, { recursive: true });
    writeFileSync(join(hub.importDir, name), Buffer.concat(chunks)); // mantém o original para reprocessamento
    log('info', `importação manual: ${name}`, { sessions });
    return json(res, 200, { ok: true, sessions, records: recs.length });
  } catch (e) {
    return json(res, 400, { error: `Arquivo inválido: ${e instanceof Error ? e.message : e}` });
  }
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
