/** open-data.json determinístico (a partir dos fixtures) para os testes do modo site. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseCvmFii, parseCvmMonthly } from '../server/sources/cvm-fii';
import { parseTesouro } from '../server/sources/tesouro';
import { mergeRates, parseBis, parseEcb, parseNyFed } from '../server/sources/global-rates';
import type { OpenData } from '../src/web/open-data';

const out = process.argv[2] ?? 'test-results/dist-web/data/open-data.json';
const fx = (f: string, enc: BufferEncoding = 'utf8') => readFileSync(join(import.meta.dirname, '..', 'server', 'fixtures', f), enc);
const geral = fx('cvm-geral-excerpt.csv', 'latin1');
const comp = fx('cvm-complemento-excerpt.csv', 'latin1');
const monthly = parseCvmMonthly(comp);
const funds = [...parseCvmFii(geral, comp).values()].map((i) => {
  const real = monthly.get(i.cnpj) ?? [];
  // completa 12 meses sintéticos para exercitar o DY 12m (valores próximos aos reais do fixture)
  const months = Array.from({ length: 12 }, (_, k) => ({ ref: `${k < 2 ? 2025 : 2026}-${String(((k + 10) % 12) + 1).padStart(2, '0')}`, dps: real[real.length - 1]?.dps ?? 0.1 }));
  return { ...i, months };
});
const now = new Date().toISOString();
const ok = (key: string, label: string, asOf: string) => ({ key, label, asOf, lastAttempt: now, lastSuccess: now, lastError: null, schedule: 'Publicado diariamente pelo site (dados abertos)' });
const sgs = (code: number, key: string, label: string, unit: string, value: number) => ({ code, key, label, unit, last: { date: '2026-11-06', value }, history: [{ date: '2026-11-06', value }], source: `Banco Central do Brasil — SGS série ${code}`, sourceUrl: 'https://api.bcb.gov.br/' });
const data: OpenData = {
  builtAt: now,
  funds,
  macro: { indicators: [sgs(432, 'selic_meta', 'Selic — meta Copom', '% a.a.', 13.75), sgs(4389, 'cdi', 'CDI (anualizado, base 252)', '% a.a.', 13.65), sgs(13522, 'ipca_12m', 'IPCA — acumulado 12 meses', '%', 4.58)], tesouro: { ...parseTesouro(fx('tesouro-excerpt.csv')), source: 'Tesouro Transparente', sourceUrl: 'https://www.tesourotransparente.gov.br/' } },
  global: { rates: mergeRates(parseBis(fx('bis-excerpt.csv')), [parseNyFed(JSON.parse(fx('nyfed-effr.json'))), parseEcb(fx('ecb-dfr.csv'))]) },
  status: [ok('cvm', 'CVM — informe mensal de FII', '2026-10-01'), ok('macro', 'Banco Central (SGS)', '2026-11-05'), ok('global', 'Juros de bancos centrais', '2026-11-08')],
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`open-data de teste: ${funds.length} fundos → ${out}`);
