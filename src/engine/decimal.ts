/**
 * Aritmética decimal configurada para cálculos financeiros.
 * Nenhum cálculo monetário do motor usa ponto flutuante binário.
 */
import DecimalBase from 'decimal.js';

export const D = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type Numeric = Dec | string | number;

export const ZERO = new D(0);
export const ONE = new D(1);

export function dec(v: Numeric): Dec {
  if (v instanceof D) return v;
  if (typeof v === 'number' && !Number.isFinite(v)) throw new RangeError(`Valor não finito: ${v}`);
  // números JS são convertidos via string para não herdar ruído binário de entrada.
  return new D(typeof v === 'number' ? String(v) : v);
}

/** Arredonda para centavos pelo critério decimal half-up (0,005 → 0,01). */
export function toCents(v: Numeric): Dec {
  return dec(v).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Trunca (nunca arredonda para cima) — usado em dividendos derivados, para não criar provento artificial. */
export function truncate(v: Numeric, places: number): Dec {
  return dec(v).toDecimalPlaces(places, D.ROUND_DOWN);
}

export function decimalPlaces(v: Numeric): number {
  return dec(v).decimalPlaces();
}
