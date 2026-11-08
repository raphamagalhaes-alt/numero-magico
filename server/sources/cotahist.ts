/**
 * Leitura do layout posicional oficial do COTAHIST (B3), para todos os ativos do mercado à vista.
 * Classes pelo código BDI: 02/07/08 ações · 12 FII · 13 Fiagro · 14 fundos listados (ETFs etc.) · 34/35/36 BDRs.
 */
import type { AssetClassCode } from '../../src/market/universe';

export interface CotahistRecord {
  date: string; ticker: string; bdi: string; name: string; spec: string; isin: string;
  open: number; high: number; low: number; close: number; volume: number; trades: number; factor: number;
}

const num = (s: string) => Number(s) / 100;

export function classify(bdi: string, name: string): AssetClassCode | null {
  switch (bdi) {
    case '02': case '07': case '08': return 'ACAO';
    case '12': return 'FII';
    case '13': return 'FIAGRO';
    case '14':
      if (/^FIAGRO/i.test(name)) return 'FIAGRO';
      if (/^FII\b/i.test(name)) return 'FII';
      if (/^(FIDC|FIP|FI\s|FIC\s|FUNDO)/i.test(name)) return 'FUNDO';
      return 'ETF';
    case '34': case '35': case '36': return 'BDR';
    default: return null;
  }
}

/** Uma linha do COTAHIST → registro (mercado à vista, classes conhecidas) ou null. */
export function parseCotahistLine(line: string): CotahistRecord | null {
    if (line.length < 245 || !line.startsWith('01') || line.slice(24, 27) !== '010') return null;
    const bdi = line.slice(10, 12);
    const name = line.slice(27, 39).trim();
    if (!classify(bdi, name)) return null;
    const factor = Number(line.slice(210, 217)) || 1;
    const d = line.slice(2, 10);
    return {
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      ticker: line.slice(12, 24).trim(), bdi, name, spec: line.slice(39, 49).trim(), isin: line.slice(230, 242),
      open: num(line.slice(56, 69)) / factor, high: num(line.slice(69, 82)) / factor, low: num(line.slice(82, 95)) / factor,
      close: num(line.slice(108, 121)) / factor, trades: Number(line.slice(147, 152)), volume: num(line.slice(170, 188)), factor,
    };
}

/** Registros do mercado à vista (TPMERC 010) de classes conhecidas. */
export function parseCotahistAll(text: string): CotahistRecord[] {
  const out: CotahistRecord[] = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const r = parseCotahistLine(text.slice(start, end).replace(/\r$/, ''));
    start = end + 1;
    if (r) out.push(r);
  }
  return out;
}
