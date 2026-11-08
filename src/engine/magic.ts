import { D, dec, toCents, type Numeric, ZERO } from './decimal';
import { costModel, orderFees, orderTotal } from './costs';
import type { MagicNumberResult } from './types';

export interface MagicOptions {
  tradingCostPct?: Numeric;
  tradingCostFixed?: Numeric;
  dividendTaxRate?: Numeric;
}

/**
 * Número mágico = teto[(cotas desejadas × preço) / dividendo], ajustado pela quantização
 * do rendimento em centavos: menor n inteiro tal que o rendimento líquido em centavos,
 * centavos(n × dividendo) − IR, paga a compra desejada (preço × cotas + custos).
 */
export function magicNumber(price: Numeric, dividend: Numeric, desiredShares: number, opts: MagicOptions = {}): MagicNumberResult {
  const p = dec(price);
  const d = dec(dividend);
  if (p.lte(0)) throw new RangeError('Preço deve ser maior que zero.');
  if (!Number.isInteger(desiredShares) || desiredShares <= 0) throw new RangeError('Cotas desejadas devem ser inteiro positivo.');
  const costs = costModel(opts.tradingCostPct ?? 0, opts.tradingCostFixed ?? 0);
  const tax = dec(opts.dividendTaxRate ?? 0);
  const targetCost = orderTotal(desiredShares, p, costs);
  const netFactor = D.max(ZERO, dec(1).sub(tax));

  if (d.lte(0) || netFactor.isZero()) {
    return { finite: false, shares: 0, theoreticalShares: 0, quantizationAdjusted: false, targetCost, initialFees: ZERO, initialInvestment: ZERO, firstIncome: ZERO };
  }

  const theoretical = targetCost.div(d.mul(netFactor)).toDecimalPlaces(0, D.ROUND_CEIL).toNumber();
  const net = (k: number) => {
    const gross = toCents(d.mul(k));
    return gross.sub(toCents(gross.mul(tax)));
  };
  let n = theoretical;
  while (n > 0 && net(n - 1).gte(targetCost)) n--;
  while (net(n).lt(targetCost)) n++;
  const initialFees = orderFees(n, p, costs);
  return {
    finite: true,
    shares: n,
    theoreticalShares: theoretical,
    quantizationAdjusted: n !== theoretical,
    targetCost,
    initialFees,
    initialInvestment: p.mul(n).add(initialFees),
    firstIncome: toCents(d.mul(n)),
  };
}
