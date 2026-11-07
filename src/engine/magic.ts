import { D, dec, toCents, type Numeric, ZERO } from './decimal';
import type { MagicNumberResult } from './types';

/**
 * Número mágico = teto[(cotas desejadas × preço) / dividendo], ajustado pela quantização
 * do rendimento em centavos: retorna a menor quantidade inteira n tal que
 * centavos(n × dividendo) ≥ cotas desejadas × preço.
 */
export function magicNumber(price: Numeric, dividend: Numeric, desiredShares: number): MagicNumberResult {
  const p = dec(price);
  const d = dec(dividend);
  if (p.lte(0)) throw new RangeError('Preço deve ser maior que zero.');
  if (!Number.isInteger(desiredShares) || desiredShares <= 0) throw new RangeError('Cotas desejadas devem ser inteiro positivo.');
  const targetCost = p.mul(desiredShares);

  if (d.lte(0)) {
    return {
      finite: false, shares: 0, theoreticalShares: 0, quantizationAdjusted: false,
      targetCost, initialInvestment: ZERO, firstIncome: ZERO,
    };
  }

  const theoretical = targetCost.div(d).toDecimalPlaces(0, D.ROUND_CEIL).toNumber();
  let n = theoretical;
  const income = (k: number) => toCents(d.mul(k));
  // A quantização half-up pode permitir menos cotas ...
  while (n > 0 && income(n - 1).gte(targetCost)) n--;
  // ... ou exigir mais (quando o custo tem mais de 2 casas, por exemplo).
  while (income(n).lt(targetCost)) n++;

  return {
    finite: true,
    shares: n,
    theoreticalShares: theoretical,
    quantizationAdjusted: n !== theoretical,
    targetCost,
    initialInvestment: p.mul(n),
    firstIncome: income(n),
  };
}
