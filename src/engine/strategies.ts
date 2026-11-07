import type { Dec } from './decimal';
import { simulate } from './simulate';
import type { SimulationInput, SimulationResult } from './types';

export type StrategyId = 'reinvest100' | 'reinvest50' | 'reinvest0';

export const STRATEGIES: { id: StrategyId; label: string; ratio: string }[] = [
  { id: 'reinvest100', label: 'Reinvestir 100%', ratio: '1' },
  { id: 'reinvest50', label: 'Reinvestir 50%', ratio: '0.5' },
  { id: 'reinvest0', label: 'Não reinvestir', ratio: '0' },
];

export interface StrategyOutcome {
  id: StrategyId;
  label: string;
  result: SimulationResult;
  /** Patrimônio ainda investido (cotas + caixa residual) no último mês. */
  finalEquity: Dec;
  /** Dividendos retirados em dinheiro — NÃO fazem parte do patrimônio investido. */
  cashReceived: Dec;
  finalShares: number;
  finalIncome: Dec;
}

export function compareStrategies(base: SimulationInput): StrategyOutcome[] {
  return STRATEGIES.map((s) => {
    const result = simulate({ ...base, reinvestRatio: s.ratio });
    return {
      id: s.id,
      label: s.label,
      result,
      finalEquity: result.summary.finalEquity,
      cashReceived: result.summary.totalWithdrawn,
      finalShares: result.summary.finalShares,
      finalIncome: result.summary.finalIncome,
    };
  });
}
