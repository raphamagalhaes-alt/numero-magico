/**
 * Verificação ao vivo das fontes. Cotações da B3 (COTAHIST) só são consultadas com
 * B3_MARKET_DATA_AUTHORIZED=1 — a B3 proíbe a coleta automatizada da página de Cotações Históricas.
 * Uso: npm run check:live — sai com código 1 se alguma fonte falhar.
 */
import { OfficialB3FnetProvider } from '../server/providers/official';
import { createFetch } from '../server/http';
import { ASSETS } from '../src/assets/registry';
import { B3_LISTED_URL, parseListedCash } from '../server/sources/b3-listed';
import { fetchSgs } from '../server/sources/bcb';

const authorized = process.env.B3_MARKET_DATA_AUTHORIZED === '1';
const f = createFetch();
const p = new OfficialB3FnetProvider({ cnpjByTicker: Object.fromEntries(Object.values(ASSETS).map((a) => [a.ticker, a.cnpj])), fetchImpl: f, automatedQuotes: authorized, localTrade: () => null });
let failed = 0;
const ok = (m: string) => console.log(`✓ ${m}`);
const bad = (m: string) => { failed++; console.error(`✗ ${m}`); };
for (const t of Object.keys(ASSETS)) {
  try {
    const d = await p.fetchDividends(t);
    const ev = d.announced ?? d.paid;
    ok(`${t}: rendimento ${d.announced ? 'anunciado' : 'pago'} R$ ${ev?.amountPerShare} (data-com ${ev?.recordDate}, pagamento ${ev?.paymentDate}) · Fundos.NET`);
    if (authorized) { const q = await p.fetchLastTrade(t); ok(`${t}: fechamento R$ ${q.price} (${q.sessionDate}) · COTAHIST`); }
  } catch (e) { bad(`${t}: ${e instanceof Error ? e.message : e}`); }
}
try {
  const r = await f(B3_LISTED_URL('PETR'), { headers: { Accept: 'application/json' } });
  const ev = parseListedCash(await r.json());
  ok(`PETR: ${ev.length} proventos em dinheiro (B3 — Empresas Listadas), último data-com ${ev.map((e) => e.recordDate).sort().pop()}`);
} catch (e) { bad(`B3 Empresas Listadas: ${e instanceof Error ? e.message : e}`); }
try {
  const s = await fetchSgs(f, new Date().toISOString().slice(0, 10));
  ok(`Banco Central: ${s.map((x) => `${x.key}=${x.last?.value}`).join(' ')}`);
} catch (e) { bad(`Banco Central: ${e instanceof Error ? e.message : e}`); }
if (!authorized) console.log('ℹ Cotações B3 não consultadas (sem B3_MARKET_DATA_AUTHORIZED=1): importe os arquivos COTAHIST manualmente.');
process.exit(failed ? 1 : 0);
