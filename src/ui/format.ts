import { dec, type Numeric } from '../engine';

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** R$ 1.582,42 — arredondado half-up em centavos pelo Decimal antes de formatar. */
export function fmtBRL(v: Numeric): string {
  const d = dec(v);
  const body = fmtDecimal(d.abs(), 2); // string exata, half-up, sem ponto flutuante
  return (d.isNeg() && !d.abs().toDecimalPlaces(2).isZero() ? '-' : '') + 'R$ ' + body;
}

/** Formata com casas decimais exatas da origem (mín. 2), ex.: dividendo R$ 0,095. */
export function fmtBRLPrecise(v: Numeric, minPlaces = 2): string {
  const d = dec(v);
  const places = Math.max(minPlaces, d.decimalPlaces());
  return 'R$ ' + fmtDecimal(d, places);
}

export function fmtDecimal(v: Numeric, places: number): string {
  const s = dec(v).toFixed(places);
  const neg = s.startsWith('-');
  const [i, f] = (neg ? s.slice(1) : s).split('.');
  const intPart = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + intPart + (f ? ',' + f : '');
}

export function fmtInt(n: number): string {
  return int.format(n);
}

export function fmtPct(v: Numeric, places = 2): string {
  return fmtDecimal(dec(v).mul(100), places) + '%';
}

export function fmtCompactBRL(n: number): string {
  const trim = (s: string) => s.replace(/,0$/, '');
  if (Math.abs(n) >= 1e6) return trim(fmtDecimal(n / 1e6, 1)) + ' mi';
  if (Math.abs(n) >= 1e3) return trim(fmtDecimal(n / 1e3, 1)) + ' mil';
  return fmtDecimal(n, 0);
}

export function yearsMonthsLabel(month: number): string {
  const y = Math.floor(month / 12);
  const m = month % 12;
  const ys = y === 1 ? '1 ano' : `${y} anos`;
  const ms = m === 1 ? '1 mês' : `${m} meses`;
  return `${ys} e ${ms}`;
}
