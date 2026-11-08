import { D, ZERO, dec, toCents, type Dec, type Numeric } from './decimal';

export interface CostModel { pct: Dec; fixed: Dec }

export function costModel(pct: Numeric = 0, fixed: Numeric = 0): CostModel {
  return { pct: dec(pct), fixed: dec(fixed) };
}

/** Custos de uma ordem de n cotas (zero se n = 0). Percentual em centavos half-up. */
export function orderFees(n: number, price: Dec, c: CostModel): Dec {
  if (n <= 0) return ZERO;
  return toCents(price.mul(n).mul(c.pct)).add(c.fixed);
}

export function orderTotal(n: number, price: Dec, c: CostModel): Dec {
  return price.mul(n).add(orderFees(n, price, c));
}

/** Maior quantidade inteira de cotas cujo custo total (preço + custos) cabe no valor disponível. */
export function affordableShares(available: Dec, price: Dec, c: CostModel): number {
  if (available.lte(0)) return 0;
  let n = available.sub(c.fixed).div(price.mul(c.pct.add(1))).toDecimalPlaces(0, D.ROUND_FLOOR).toNumber();
  if (n < 0) n = 0;
  while (n > 0 && orderTotal(n, price, c).gt(available)) n--;
  while (orderTotal(n + 1, price, c).lte(available)) n++;
  return n;
}
