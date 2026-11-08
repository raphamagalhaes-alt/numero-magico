/** Executa uma atualização completa da central de dados (útil para carga inicial e cron externo). */
import { join } from 'node:path';
import { DataHub } from '../server/hub';
import { createFetch } from '../server/http';

const hub = new DataHub({
  dir: process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'server', 'data', 'cache'),
  fetchImpl: createFetch(),
  historyMonths: Number(process.env.HISTORY_MONTHS ?? 13),
  dividendBackfillDays: Number(process.env.DIVIDEND_BACKFILL_DAYS ?? 400),
  pauseMs: Number(process.env.FNET_PAUSE_MS ?? 250),
});
const t0 = Date.now();
await hub.updateAll();
for (const s of hub.status()) console.log(`${s.lastError ? '✗' : '✓'} ${s.label}: ${s.lastError ?? `ok (referência ${s.asOf})`}`);
const u = hub.universe();
const by: Record<string, number> = {};
for (const a of u.assets) by[a.cls] = (by[a.cls] ?? 0) + 1;
console.log(`Universo: ${u.assets.length} ativos ativos ${JSON.stringify(by)} · ${u.sessions} pregões desde ${u.historyFrom} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(hub.status().some((s) => s.lastError) ? 1 : 0);
