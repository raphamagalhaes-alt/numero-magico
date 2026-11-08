/** Banco Central do Brasil — SGS (Sistema Gerenciador de Séries Temporais), API pública. */
import type { MacroIndicator, MacroSeriesPoint } from '../../src/market/universe';
import { brDate } from './csv';
import { addDays } from '../../src/engine/calendar';

export const SGS = [
  { code: 432, key: 'selic_meta', label: 'Selic — meta Copom', unit: '% a.a.' },
  { code: 4389, key: 'cdi', label: 'CDI (anualizado, base 252)', unit: '% a.a.' },
  { code: 433, key: 'ipca_mes', label: 'IPCA — variação mensal', unit: '%' },
  { code: 13522, key: 'ipca_12m', label: 'IPCA — acumulado 12 meses', unit: '%' },
  { code: 189, key: 'igpm_mes', label: 'IGP-M — variação mensal', unit: '%' },
  { code: 1, key: 'dolar_ptax', label: 'Dólar PTAX (venda)', unit: 'R$' },
  { code: 21619, key: 'euro_ptax', label: 'Euro PTAX (venda)', unit: 'R$' },
] as const;

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Consulta por intervalo até hoje: algumas séries (ex.: meta Selic, 432) publicam datas futuras. */
export const SGS_URL = (code: number, fromIso: string, toIso: string) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${br(fromIso)}&dataFinal=${br(toIso)}`;

export function parseSgs(json: unknown, today: string): MacroSeriesPoint[] {
  if (!Array.isArray(json)) throw new Error('Resposta inesperada do SGS');
  return json
    .map((r: { data?: string; valor?: string }) => ({ date: brDate(String(r.data ?? '')), value: Number(String(r.valor ?? '').replace(',', '.')) }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value) && p.date <= today) // a série da meta Selic traz datas futuras
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * O SGS devolve 304 sem conteúdo para algumas combinações de datas (comportamento reproduzível do
 * servidor, mesmo sem cabeçalhos condicionais — ex.: série 433, 08/10/2024 a 07/11/2026). Nesses
 * casos repetimos com a janela deslocada em 1 dia; datas futuras são descartadas por parseSgs.
 */
export async function getSgs(fetchImpl: typeof fetch, code: number, fromIso: string, toIso: string): Promise<unknown> {
  const windows: [string, string][] = [[fromIso, toIso], [fromIso, addDays(toIso, 1)], [addDays(fromIso, -1), addDays(toIso, 2)]];
  let last = 0;
  for (const [i, [a, b]] of windows.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 300));
    const res = await fetchImpl(SGS_URL(code, a, b), { headers: { Accept: 'application/json' } });
    if (res.status === 200) return res.json();
    last = res.status;
    await res.arrayBuffer().catch(() => undefined);
    if (res.status !== 304 && res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`SGS ${code} respondeu HTTP ${last}`);
}

export async function fetchSgs(fetchImpl: typeof fetch, today: string): Promise<MacroIndicator[]> {
  const out: MacroIndicator[] = [];
  for (const s of SGS) {
    const monthly = s.key.includes('mes') || s.key.includes('12m');
    const from = addDays(today, monthly ? -760 : -400);
    const history = parseSgs(await getSgs(fetchImpl, s.code, from, today), today);
    out.push({ ...s, last: history[history.length - 1] ?? null, history, source: `Banco Central do Brasil — SGS série ${s.code}`, sourceUrl: SGS_URL(s.code, addDays(today, monthly ? -400 : -10), today) });
  }
  return out;
}
