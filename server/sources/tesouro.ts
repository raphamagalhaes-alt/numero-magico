/** Tesouro Transparente — preços e taxas dos títulos do Tesouro Direto (dados abertos, atualização diária). */
import type { TesouroBond } from '../../src/market/universe';
import { brDate, brNumber } from './csv';

export const TESOURO_URL = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

/** Mantém apenas a data-base mais recente; remove linhas duplicadas. */
export function parseTesouro(csv: string): { baseDate: string | null; bonds: TesouroBond[] } {
  const lines = csv.split(/\r?\n/);
  const head = lines[0]?.split(';').map((h) => h.trim()) ?? [];
  const ix = (n: string) => head.indexOf(n);
  const [iT, iV, iD, iTC, iTV, iPC, iPV] = ['Tipo Titulo', 'Data Vencimento', 'Data Base', 'Taxa Compra Manha', 'Taxa Venda Manha', 'PU Compra Manha', 'PU Venda Manha'].map(ix);
  if ([iT, iV, iD].some((i) => i < 0)) throw new Error('Cabeçalho do CSV do Tesouro inesperado');
  let max = '';
  const rows: string[][] = [];
  for (const l of lines.slice(1)) {
    if (!l) continue;
    const c = l.split(';');
    const d = brDate(c[iD]);
    if (d > max) { max = d; rows.length = 0; }
    if (d === max) rows.push(c);
  }
  const seen = new Set<string>();
  const bonds: TesouroBond[] = [];
  for (const c of rows) {
    const key = `${c[iT]}|${c[iV]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bonds.push({
      type: c[iT], maturity: brDate(c[iV]), baseDate: max,
      buyRate: brNumber(c[iTC]), sellRate: brNumber(c[iTV]), buyPrice: brNumber(c[iPC]), sellPrice: brNumber(c[iPV]),
    });
  }
  bonds.sort((a, b) => a.type.localeCompare(b.type) || a.maturity.localeCompare(b.maturity));
  return { baseDate: max || null, bonds };
}
