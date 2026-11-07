import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ManualFileProvider } from './providers/manual';
import { HttpJsonProvider } from './providers/http-json';
import type { MarketDataProvider } from './providers/types';
import { JsonStore } from './store';
import { MarketService } from './service';
import { nextNineAm, startDailyScheduler } from './scheduler';
import { ASSETS } from '../src/assets/registry';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);

const provider: MarketDataProvider = process.env.MARKET_PROVIDER_URL
  ? new HttpJsonProvider(process.env.MARKET_PROVIDER_URL, process.env.MARKET_PROVIDER_TOKEN, process.env.MARKET_PROVIDER_NAME)
  : new ManualFileProvider(process.env.MARKET_MANUAL_FILE ?? join(here, 'data', 'market-manual.json'));
const store = new JsonStore(process.env.MARKET_STORE_FILE ?? join(here, 'data', 'market-store.json'));
const service = new MarketService(provider, store);
const tickers = Object.keys(ASSETS);

if (provider.isConfigured()) {
  service.nextScheduledRun = () => nextNineAm(new Date());
  startDailyScheduler(async () => { for (const t of tickers) await service.refresh(t); });
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, provider: provider.name, configured: provider.isConfigured() });
  const m = url.pathname.match(/^\/api\/market\/([A-Z0-9]{4,8})(\/refresh)?$/);
  if (!m) return json(res, 404, { error: 'Rota não encontrada' });
  const ticker = m[1];
  if (!tickers.includes(ticker)) return json(res, 404, { error: `Ativo ${ticker} não cadastrado` });
  if (m[2]) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
    return json(res, 200, await service.refresh(ticker));
  }
  return json(res, 200, service.status(ticker));
}

createServer((req, res) => {
  handle(req, res).catch((e) => json(res, 500, { error: String(e) }));
}).listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT} — provedor: ${provider.name} (${provider.isConfigured() ? 'configurado' : 'sem dados configurados'})`);
});
