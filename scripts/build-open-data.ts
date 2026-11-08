/**
 * Gera o pacote de DADOS ABERTOS do site (open-data.json): CVM (cadastro, VP/cota, cotistas e
 * estimativa mensal de rendimento dos FIIs — licença ODbL), Banco Central (SGS), Tesouro
 * Transparente e juros de bancos centrais (BIS, Fed NY, BCE). Nenhum dado da B3 é incluído.
 * Uso: tsx scripts/build-open-data.ts <saida.json>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createFetch } from '../server/http';
import { fetchCvmPackage, parseCvmFii, parseCvmMonthly, type FiiInfo } from '../server/sources/cvm-fii';
import { fetchSgs } from '../server/sources/bcb';
import { parseTesouro, TESOURO_URL } from '../server/sources/tesouro';
import { BIS_URL, ECB_URL, NYFED_URL, mergeRates, parseBis, parseEcb, parseNyFed } from '../server/sources/global-rates';
import { saoPauloDate } from '../src/engine/calendar';
import type { OpenData, OpenFund } from '../src/web/open-data';
import type { DatasetStatus } from '../src/market/universe';

const out = process.argv[2] ?? 'dist-web/data/open-data.json';
const f = createFetch();
const now = new Date();
const today = saoPauloDate(now);
const status: DatasetStatus[] = [];
const rec = (key: string, label: string, asOf: string | null, err: unknown = null) => status.push({ key, label, asOf, lastAttempt: now.toISOString(), lastSuccess: err ? null : now.toISOString(), lastError: err ? (err instanceof Error ? err.message : String(err)) : null, schedule: 'Publicado diariamente pelo site (dados abertos)' });

let funds: OpenFund[] = [];
try {
  const year = Number(today.slice(0, 4));
  const infos = new Map<string, FiiInfo>();
  const months = new Map<string, Map<string, number>>();
  for (const y of [year - 1, year]) {
    let pkg;
    try { pkg = await fetchCvmPackage(f, y); } catch (e) { if (y === year) throw e; continue; }
    for (const [isin, v] of parseCvmFii(pkg.geral, pkg.complemento)) { const p = infos.get(isin); if (!p || v.refDate > p.refDate) infos.set(isin, v); }
    for (const [cnpj, list] of parseCvmMonthly(pkg.complemento)) { const m = months.get(cnpj) ?? months.set(cnpj, new Map()).get(cnpj)!; for (const x of list) m.set(x.ref, x.dps); }
  }
  funds = [...infos.values()].map((i) => ({ ...i, months: [...(months.get(i.cnpj) ?? new Map())].map(([ref, dps]) => ({ ref, dps })).sort((a, b) => a.ref.localeCompare(b.ref)).slice(-14) }));
  rec('cvm', 'CVM — informe mensal de FII (cadastro, VP/cota e rendimento estimado)', funds.reduce((m, x) => (x.refDate > m ? x.refDate : m), ''));
} catch (e) { rec('cvm', 'CVM — informe mensal de FII', null, e); }

let macro: OpenData['macro'] = null;
try {
  const indicators = await fetchSgs(f, today);
  let tesouro = { baseDate: null as string | null, bonds: [] as ReturnType<typeof parseTesouro>['bonds'], source: 'Tesouro Transparente — Preços e taxas do Tesouro Direto', sourceUrl: TESOURO_URL };
  try { const r = await f(TESOURO_URL); if (!r.ok) throw new Error(`HTTP ${r.status}`); tesouro = { ...tesouro, ...parseTesouro(await r.text()) }; rec('tesouro', 'Tesouro Direto', tesouro.baseDate); }
  catch (e) { rec('tesouro', 'Tesouro Direto', null, e); }
  macro = { indicators, tesouro };
  rec('macro', 'Banco Central (SGS)', indicators.find((i) => i.key === 'cdi')?.last?.date ?? null);
} catch (e) { rec('macro', 'Banco Central (SGS)', null, e); }

let global: OpenData['global'] = null;
try {
  const [bis, ny, ecb] = await Promise.allSettled([
    f(BIS_URL).then((r) => r.text()).then(parseBis), f(NYFED_URL).then((r) => r.json()).then(parseNyFed), f(ECB_URL).then((r) => r.text()).then(parseEcb),
  ]);
  global = { rates: mergeRates(bis.status === 'fulfilled' ? bis.value : [], [ny.status === 'fulfilled' ? ny.value : null, ecb.status === 'fulfilled' ? ecb.value : null]) };
  rec('global', 'Juros de bancos centrais (BIS, Fed NY, BCE)', global.rates.reduce((m, r) => (r.date > m ? r.date : m), ''));
} catch (e) { rec('global', 'Juros de bancos centrais', null, e); }

const LICENSE = 'Base derivada de: CVM Dados Abertos (dados.cvm.gov.br) e Tesouro Transparente (tesourotransparente.gov.br), licenciados sob Open Database License (ODbL) v1.0 — esta base derivada também é disponibilizada sob ODbL v1.0 (https://opendatacommons.org/licenses/odbl/1-0/); Banco Central do Brasil (SGS); Source: BIS; Federal Reserve Bank of New York; Source: ECB statistics. Valores de rendimento marcados como estimados são cálculos próprios, não dados oficiais. Sem vínculo ou endosso dessas instituições.';
const data: OpenData = { builtAt: now.toISOString(), license: LICENSE, funds, macro, global, status };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`open-data: ${funds.length} fundos · macro ${macro ? 'ok' : 'falhou'} · juros ${global?.rates.length ?? 0} países → ${out}`);
for (const s of status) console.log(`${s.lastError ? '✗' : '✓'} ${s.label}: ${s.lastError ?? s.asOf}`);
