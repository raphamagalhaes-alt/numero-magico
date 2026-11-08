/** Gera uma central de dados determinística (a partir de recortes oficiais reais) para os testes de interface. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCotahistAll } from '../server/sources/cotahist';
import { HistoryStore } from '../server/sources/history';
import { DividendStore } from '../server/sources/fnet-all';
import { StockDividendStore } from '../server/sources/b3-listed';
import { parseCvmFii } from '../server/sources/cvm-fii';
import { parseTesouro } from '../server/sources/tesouro';
import { mergeRates, parseBis, parseEcb, parseNyFed } from '../server/sources/global-rates';
import { addDays, isTradingDay } from '../src/engine/calendar';

const dir = process.argv[2] ?? 'test-results/cache-e2e';
const fx = (f: string, enc: BufferEncoding = 'utf8') => readFileSync(join(import.meta.dirname, '..', 'server', 'fixtures', f), enc);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// 260 pregões sintéticos a partir dos preços reais de 06/11/2026 (oscilação determinística)
const base = parseCotahistAll(fx('cotahist-multi-2026-11-06.txt', 'latin1'));
const h = new HistoryStore(join(dir, 'history.json'));
const days: string[] = [];
for (let d = '2026-11-06'; days.length < 260; d = addDays(d, -1)) if (isTradingDay(d)) days.unshift(d);
days.forEach((date, i) => {
  const k = 0.85 + 0.15 * (i / 259) + 0.01 * Math.sin(i / 3);
  h.addSession(date, base.map((r) => ({ ...r, date, close: i === 259 ? r.close : Math.round(r.close * k * 100) / 100 })));
});
h.save();

const d = new DividendStore(join(dir, 'dividends.json'));
for (let m = 0; m < 12; m++) {
  const rec = `2026-${String(10 - m > 0 ? 10 - m : 12 + 10 - m).padStart(2, '0')}-28`.replace(/^2026-(1[12])/, '2025-$1');
  d.upsert('MXRF11', { amount: m === 0 ? 0.095 : 0.1, recordDate: m === 0 ? '2026-10-30' : rec, paymentDate: m === 0 ? '2026-11-16' : addDays(rec, 15), taxExempt: true, docId: 1000 + m, version: 1, deliveredAt: rec, cnpj: '97521225000125' });
  d.upsert('HGLG11', { amount: 1.17, recordDate: m === 0 ? '2026-10-30' : rec, paymentDate: m === 0 ? '2026-11-16' : addDays(rec, 15), taxExempt: true, docId: 2000 + m, version: 1, deliveredAt: rec, cnpj: '11728688000147' });
}
d.d.coveredFrom = '2025-11-01'; d.d.coveredTo = '2026-11-07';
d.save();

const sd = new StockDividendStore(join(dir, 'stock-dividends.json'));
sd.set([
  { isin: 'BRPETRACNPR6', amount: 0.9, recordDate: '2026-08-21', paymentDate: '2026-12-21', approvedOn: '2026-08-06', kind: 'DIVIDENDO', relatedTo: 'Anual/2026' },
  { isin: 'BRPETRACNPR6', amount: 0.6, recordDate: '2026-05-20', paymentDate: '2026-08-20', approvedOn: '2026-05-10', kind: 'JCP', relatedTo: 'Anual/2026' },
  { isin: 'BRPETRACNPR6', amount: 0.9, recordDate: '2026-02-20', paymentDate: '2026-05-20', approvedOn: '2026-02-10', kind: 'DIVIDENDO', relatedTo: 'Anual/2025' },
], ['BRPETRACNPR6']);
sd.save();

const cvm = parseCvmFii(fx('cvm-geral-excerpt.csv', 'latin1'), fx('cvm-complemento-excerpt.csv', 'latin1'));
const sgs = (code: number, key: string, label: string, unit: string, value: number) => ({ code, key, label, unit, last: { date: '2026-11-06', value }, history: [{ date: '2026-11-06', value }], source: `Banco Central do Brasil — SGS série ${code}`, sourceUrl: 'https://api.bcb.gov.br/' });
const now = new Date().toISOString();
const ok = { lastSuccess: now, lastAttempt: now, lastError: null, asOf: '2026-11-06' };
writeFileSync(join(dir, 'hub.json'), JSON.stringify({
  status: { cotacoes: ok, cvm: ok, rendimentos: ok, acoes: ok, macro: ok, global: ok },
  cvm: Object.fromEntries(cvm),
  macro: {
    indicators: [sgs(432, 'selic_meta', 'Selic — meta Copom', '% a.a.', 13.75), sgs(4389, 'cdi', 'CDI (anualizado, base 252)', '% a.a.', 13.65), sgs(13522, 'ipca_12m', 'IPCA — acumulado 12 meses', '%', 4.58), sgs(1, 'dolar_ptax', 'Dólar PTAX (venda)', 'R$', 5.5013)],
    tesouro: { ...parseTesouro(fx('tesouro-excerpt.csv')), source: 'Tesouro Transparente', sourceUrl: 'https://www.tesourotransparente.gov.br/' },
  },
  global: { rates: mergeRates(parseBis(fx('bis-excerpt.csv')), [parseNyFed(JSON.parse(fx('nyfed-effr.json'))), parseEcb(fx('ecb-dfr.csv'))]) },
}));
console.log(`central de dados de teste criada em ${dir}`);
