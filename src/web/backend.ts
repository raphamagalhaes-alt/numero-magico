/**
 * MODO SITE — o "servidor" roda dentro do navegador de cada pessoa. O site só publica código e
 * dados abertos (CVM, Banco Central, Tesouro, BIS, Fed, BCE). Cotações vêm do próprio usuário:
 * arquivo COTAHIST que ele baixou no site da B3 (processado aqui, no aparelho dele) e/ou a chave
 * pessoal gratuita da brapi (consultada direto do navegador dele). Nada disso sai do aparelho.
 */
import { computeMetrics } from '../market/analytics';
import { HistoryData, type HistoryJson } from '../market/history-core';
import type { AssetClassCode, AssetDetail, AssetMetrics, DatasetStatus, UniverseResponse } from '../market/universe';
import type { MarketStatus } from '../market/types';
import { addMonths, lastBusinessDayOfMonth, saoPauloDate, saoPauloHour, isTradingDay } from '../engine/calendar';
import { D } from '../engine/decimal';
import { COTAHIST_NAME } from './names';
import { readCotahistStream } from './cotahist-stream';
import { idbGet, idbSet } from './idb';
import type { OpenData, OpenFund } from './open-data';

// a chave vai no cabeçalho Authorization (não na URL), como recomenda a brapi
const BRAPI = (t: string, hist: boolean) => `https://brapi.dev/api/quote/${encodeURIComponent(t)}${hist ? '?range=3mo&interval=1d' : ''}`;
const TICKER = /^[A-Z0-9]{4}\d{1,2}$/;
interface Settings { brapiToken: string | null; watchlist: string[]; lastBrapi?: string; brapiNote?: string | null; lastImport?: string | null }

let history = new HistoryData(300);
let settings: Settings = { brapiToken: null, watchlist: [] };
let open: OpenData | null = null;
let openError: string | null = null;
let fundsByIsin = new Map<string, OpenFund>();
let ready: Promise<void> | null = null;
let version = 0;
const quoteSource: Record<string, string> = {};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const today = () => saoPauloDate(new Date());

async function init(fetchOrig: typeof fetch) {
  const [h, s] = await Promise.all([idbGet<HistoryJson>('history'), idbGet<Settings>('settings')]);
  if (h) history = new HistoryData(300, h);
  if (s) settings = { ...settings, ...s };
  try {
    const r = await fetchOrig(`${import.meta.env.BASE_URL}data/open-data.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    open = (await r.json()) as OpenData;
    fundsByIsin = new Map(open.funds.map((f) => [f.isin, f]));
  } catch (e) { openError = `Dados abertos indisponíveis: ${e instanceof Error ? e.message : e}`; }
  void refreshBrapi(fetchOrig, false);
}

const saveHistory = () => idbSet('history', history.toJSON());
const saveSettings = () => idbSet('settings', settings);

/** FII/Fiagro: ISIN padrão BR + 4 letras do ticker + CTF… (procura no cadastro aberto da CVM). */
function fundForTicker(t: string): OpenFund | undefined {
  const isin = history.meta(t)?.isin;
  if (isin && fundsByIsin.has(isin)) return fundsByIsin.get(isin);
  if (!/11$/.test(t)) return undefined;
  const pre = `BR${t.slice(0, 4)}CTF`;
  const c = open?.funds.filter((f) => f.isin.startsWith(pre)) ?? [];
  return c.length === 1 ? c[0] : undefined;
}

/** Rendimento mensal estimado: média dos últimos 12 meses da CVM (erro típico de poucos %). */
function fundEstimate(f: OpenFund): { monthly: number; months: number; sum: number; lastRef: string } | null {
  const ms = f.months.slice(-12);
  if (!ms.length) return null;
  const sum = ms.reduce((a, m) => a + m.dps, 0);
  return { monthly: sum / ms.length, months: ms.length, sum, lastRef: ms[ms.length - 1].ref };
}

function metricsOf(t: string): AssetMetrics | null {
  const meta = history.meta(t);
  if (!meta) return null;
  const f = meta.cls === 'FII' || meta.cls === 'FIAGRO' ? fundForTicker(t) : undefined;
  const months = f?.months.slice(-12) ?? [];
  const divs = months.map((m) => { const rd = lastBusinessDayOfMonth(m.ref); return { amount: m.dps, recordDate: rd, paymentDate: lastBusinessDayOfMonth(addMonths(m.ref, 1)) }; });
  return computeMetrics(t, meta, history.points(t), {
    today: today(),
    fii: f ? { cnpj: f.cnpj, vpPerShare: f.vpPerShare, shareholders: f.shareholders, segment: f.segment, administrator: f.administrator, refDate: f.refDate } : null,
    fundDividends: divs,
    fundCoverageFrom: months.length >= 12 ? '1900-01-01' : null,
    fundEstimated: true,
  });
}

function universe(): UniverseResponse {
  const dates = history.dates;
  const minActive = dates[Math.max(0, dates.length - 10)] ?? '';
  const assets = history.tickers().map(metricsOf).filter((m): m is AssetMetrics => !!m && m.sessionDate >= minActive);
  return { asOf: dates[dates.length - 1] ?? null, sessions: dates.length, historyFrom: dates[0] ?? null, dividendsCoverageFrom: null, assets };
}

function marketStatus(t: string): MarketStatus {
  const m = metricsOf(t);
  const f = fundForTicker(t);
  const est = f ? fundEstimate(f) : null;
  const pts = history.points(t);
  const last = pts[pts.length - 1];
  const monthly = est ? new D(String(est.monthly)).toDecimalPlaces(6, D.ROUND_DOWN) : null;
  return {
    ticker: t, lastAttemptAt: settings.lastBrapi ?? null, lastError: !last ? 'Sem cotação: configure sua chave brapi ou envie um arquivo COTAHIST (Status dos dados).' : est ? null : 'Rendimento não disponível no modo site para este ativo — informe manualmente.',
    stale: false, providerConfigured: true, providerName: 'Navegador (dados do próprio usuário + dados abertos)', automaticUpdates: Boolean(settings.brapiToken), nextScheduledRun: null,
    snapshot: last ? {
      ticker: t, provider: 'navegador', fetchedAt: new Date().toISOString(),
      lastTrade: { price: last.close.toFixed(2), sessionDate: last.date, tradedAt: `${last.date}T18:00:00-03:00`, kind: 'fechamento', source: quoteSource[t] ?? 'Arquivo COTAHIST enviado pelo usuário' },
      lastPaidDividend: monthly && est ? {
        amountPerShare: monthly.toFixed(), recordDate: lastBusinessDayOfMonth(est.lastRef), paymentDate: lastBusinessDayOfMonth(addMonths(est.lastRef, 1)),
        referencePeriod: `ESTIMATIVA: média de ${est.months} meses do informe mensal da CVM (DY × VP/cota), até ${est.lastRef}; pode diferir alguns % do valor anunciado`,
        source: 'CVM Dados Abertos — informe mensal de FII (ODbL)', estimated: 'cvm',
      } : null,
      lastAnnouncedDividend: null,
      ...(m?.cnpj ? { administrator: m.administrator ?? undefined } : {}),
    } : null,
  };
}

/** Cotações pela chave pessoal brapi: histórico de 3 meses na 1ª vez, depois só o fechamento. */
async function refreshBrapi(fetchOrig: typeof fetch, force: boolean, only?: string[]): Promise<string> {
  const token = settings.brapiToken;
  const list = only ?? settings.watchlist;
  if (!token || !list.length) return 'nada a atualizar';
  const day = today();
  const closedToday = isTradingDay(day) && saoPauloHour(new Date()) >= 19;
  const key = closedToday ? `${day}-pm` : day;
  if (!force && !only && settings.lastBrapi === key) return 'já atualizado hoje';
  let updated = 0;
  const errors: string[] = [];
  for (const [i, t] of list.slice(0, 60).entries()) {
    if (i) await new Promise((r) => setTimeout(r, 300));
    const hist = !history.meta(t) || history.points(t).length < 20;
    try {
      const r = await fetchOrig(BRAPI(t, hist), { headers: { Authorization: `Bearer ${token}` } });
      const body = await r.json().catch(() => null) as { results?: Record<string, unknown>[]; message?: string } | null;
      if (r.status === 401 || r.status === 403) { errors.push(`chave recusada (${body?.message ?? r.status})`); break; }
      if (r.status === 429) { errors.push('limite do plano gratuito atingido'); break; }
      const q = body?.results?.[0];
      if (!r.ok || !q) { errors.push(`${t}: sem cotação`); continue; }
      if (!history.meta(t)) {
        const cls: AssetClassCode = /11$/.test(t) ? (fundForTicker(t) ? 'FII' : 'ETF') : /3[2-9]$/.test(t) ? 'BDR' : 'ACAO';
        history.setMeta(t, { name: String(q.longName ?? q.shortName ?? t).toUpperCase().slice(0, 24), cls, isin: fundForTicker(t)?.isin ?? '', spec: '' });
      }
      const points: { date: string; close: number; volume: number | null }[] = [];
      for (const h of (q.historicalDataPrice as { date: number; close: number; volume?: number }[] | undefined) ?? []) {
        const d = saoPauloDate(new Date(h.date * 1000));
        if (h.close > 0 && isTradingDay(d)) points.push({ date: d, close: h.close, volume: h.volume ? h.volume * h.close : null });
      }
      const price = Number(q.regularMarketPrice);
      const time = String(q.regularMarketTime ?? '');
      const d = time ? saoPauloDate(new Date(time)) : '';
      if (price > 0 && d && isTradingDay(d) && (d < day || closedToday)) points.push({ date: d, close: price, volume: typeof q.regularMarketVolume === 'number' ? q.regularMarketVolume * price : null });
      for (const p of points) history.addQuotes(p.date, [{ ticker: t, close: p.close, volume: p.volume }]);
      if (points.length) { quoteSource[t] = 'brapi (sua chave pessoal)'; updated++; }
    } catch (e) { errors.push(`${t}: ${e instanceof Error ? e.message : e}`); }
  }
  if (!only) settings.lastBrapi = key;
  settings.brapiNote = errors.length ? errors.slice(0, 3).join('; ') : null;
  await Promise.all([saveHistory(), saveSettings()]);
  version++;
  // avisa a interface para recarregar (preços chegaram em segundo plano)
  if (updated && typeof window !== 'undefined') window.dispatchEvent(new Event('nm:data-updated'));
  return `${updated} ativos atualizados${errors.length ? ` · ${errors.length} avisos` : ''}`;
}

function status(): DatasetStatus[] {
  const local: DatasetStatus[] = [
    { key: 'cotacoes', label: 'Cotações (seus arquivos COTAHIST e/ou sua chave brapi, neste aparelho)', asOf: history.dates[history.dates.length - 1] ?? null, lastAttempt: settings.lastImport ?? null, lastSuccess: settings.lastImport ?? null, lastError: history.dates.length ? null : 'Nenhuma cotação ainda: envie um arquivo COTAHIST ou configure sua chave brapi.', schedule: 'Ao abrir o site (brapi) e a cada arquivo enviado' },
    ...(settings.brapiToken ? [{ key: 'brapi', label: 'brapi — sua chave pessoal', asOf: settings.lastBrapi?.slice(0, 10) ?? null, lastAttempt: null, lastSuccess: null, lastError: settings.brapiNote ?? null, schedule: '1×/dia e após 19h em dias de pregão (ao abrir o site)' }] : []),
  ];
  return [...local, ...(open?.status ?? []), ...(openError ? [{ key: 'open', label: 'Dados abertos do site', asOf: null, lastAttempt: null, lastSuccess: null, lastError: openError, schedule: 'Diário' }] : [])];
}

async function handle(url: URL, init: RequestInit | undefined, fetchOrig: typeof fetch): Promise<Response> {
  ready ??= init_(fetchOrig);
  await ready;
  const p = url.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '');
  const method = (init?.method ?? 'GET').toUpperCase();
  if (p === '/api/health') return json({ ok: true, mode: 'site' });
  if (p === '/api/compliance') return json({ b3Authorized: false, b3PublicBlock: false, importDir: 'este navegador', automatedQuotes: false, mode: 'site' });
  if (p === '/api/universe') return json(universe());
  if (p === '/api/macro') return json(open?.macro ?? { indicators: [], tesouro: { baseDate: null, bonds: [], source: '', sourceUrl: '' } });
  if (p === '/api/rates/global') return json(open?.global ?? { rates: [] });
  if (p === '/api/data/status') return json(status());
  const a = p.match(/^\/api\/asset\/([A-Z0-9]{4,8})$/);
  if (a) {
    const m = metricsOf(a[1]);
    if (!m) return json({ error: 'Ativo sem dados neste aparelho' }, 404);
    const f = fundForTicker(a[1]);
    const detail: AssetDetail = { metrics: m, history: history.points(a[1]), dividends: (f?.months ?? []).map((x) => ({ amount: x.dps, recordDate: lastBusinessDayOfMonth(x.ref), paymentDate: lastBusinessDayOfMonth(addMonths(x.ref, 1)), source: 'Estimativa CVM (informe mensal)' })) };
    return json(detail);
  }
  const mk = p.match(/^\/api\/market\/([A-Z0-9]{4,8})(\/refresh)?$/);
  if (mk) {
    if (!TICKER.test(mk[1])) return json({ error: 'Ticker inválido' }, 404);
    if (mk[2]) {
      if (!settings.watchlist.includes(mk[1])) { settings.watchlist = [...settings.watchlist, mk[1]].slice(-60); await saveSettings(); }
      await refreshBrapi(fetchOrig, true);
    } else if (settings.brapiToken && !history.points(mk[1]).length) {
      // 1ª consulta de um ativo com a chave configurada: busca agora, antes de responder
      if (!settings.watchlist.includes(mk[1])) { settings.watchlist = [...settings.watchlist, mk[1]].slice(-60); await saveSettings(); }
      await refreshBrapi(fetchOrig, true, [mk[1]]);
    }
    return json(marketStatus(mk[1]));
  }
  if (p === '/api/settings') {
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { brapiToken?: string | null; watchlist?: unknown };
      if (body.brapiToken !== undefined) settings.brapiToken = body.brapiToken && /^[A-Za-z0-9_-]{8,200}$/.test(body.brapiToken) ? body.brapiToken : null;
      if (Array.isArray(body.watchlist)) settings.watchlist = [...new Set(body.watchlist.map(String).map((t) => t.toUpperCase()).filter((t) => TICKER.test(t)))].slice(0, 60);
      await saveSettings();
      if (body.brapiToken || Array.isArray(body.watchlist)) void refreshBrapi(fetchOrig, Boolean(body.brapiToken));
    }
    return json({ brapiConfigured: Boolean(settings.brapiToken), brapiTokenHint: settings.brapiToken ? `…${settings.brapiToken.slice(-4)}` : null, watchlist: settings.watchlist });
  }
  if (p === '/api/import/cotahist' && method === 'POST') {
    const file = init?.body;
    const name = String((init?.headers as Record<string, string> | undefined)?.['X-File-Name'] ?? '');
    if (!(file instanceof Blob)) return json({ error: 'Arquivo ausente' }, 400);
    if (!COTAHIST_NAME.test(name)) return json({ error: 'Nome de arquivo inválido: use o arquivo original (COTAHIST_Dddmmaaaa.ZIP, COTAHIST_Mmmaaaa.ZIP ou COTAHIST_Aaaaa.ZIP).' }, 400);
    try {
      const recs = await readCotahistStream(new File([file], name));
      if (!recs.length) return json({ error: 'Nenhum registro de cotação reconhecido no arquivo.' }, 400);
      const byDate = new Map<string, typeof recs>();
      for (const r of recs) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
      for (const [d, rs] of [...byDate].sort()) history.addSession(d, rs);
      settings.lastImport = new Date().toISOString();
      await Promise.all([saveHistory(), saveSettings()]);
      version++;
      return json({ ok: true, sessions: byDate.size, records: recs.length });
    } catch (e) { return json({ error: `Arquivo inválido: ${e instanceof Error ? e.message : e}` }, 400); }
  }
  if (p.startsWith('/api/')) return json({ error: 'Recurso disponível apenas no app do computador.' }, 404);
  return fetchOrig(url.toString(), init);
}
const init_ = init;

/** Intercepta chamadas a /api no navegador (o restante, como brapi e o próprio site, segue normal). */
export function installWebBackend() {
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (url.origin === window.location.origin && url.pathname.includes('/api/')) return handle(url, init, orig);
    return orig(input, init);
  };
}
export const webVersion = () => version;
/** Chave pessoal da brapi guardada neste aparelho (usada também pela página Mercados). */
export const webBrapiToken = () => settings.brapiToken;
