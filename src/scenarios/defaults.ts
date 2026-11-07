import { ASSETS, DEFAULT_TICKER } from '../assets/registry';
import type { SimulationInput } from '../engine';

export type MainTab = 'nominal' | 'inflacao' | 'aportes';

/** Parâmetros editáveis comuns às três abas principais. */
export interface BaseParams {
  ticker: string;
  price: string;
  dividend: string;
  desiredShares: number;
  inflationAnnual: string; // fração
  monthlyContribution: string;
  incomeGoal: string;
  incomeGoalBasis: 'nominal' | 'real';
}

export function demoParams(ticker = DEFAULT_TICKER): BaseParams {
  const a = ASSETS[ticker];
  return {
    ticker,
    price: a.demo.price,
    dividend: a.demo.dividend,
    desiredShares: a.demo.desiredShares,
    inflationAnnual: a.demo.inflationAnnual,
    monthlyContribution: a.demo.monthlyContribution,
    incomeGoal: '1000',
    incomeGoalBasis: 'nominal',
  };
}

export const MONTHS = 360;

/** Monta a entrada do motor para cada aba principal. */
export function inputForTab(p: BaseParams, tab: MainTab): SimulationInput {
  const base: SimulationInput = {
    price: p.price,
    dividend: p.dividend,
    desiredShares: p.desiredShares,
    months: MONTHS,
    monthlyContribution: '0',
    contributionStartMonth: 2,
    contributionAdjustAnnual: true,
    inflationAnnual: p.inflationAnnual,
    priceAnnualChange: '0',
    dividendAnnualChange: '0',
    dividendInitialChange: '0',
    reinvestRatio: '1', // abas principais: reinvestimento integral
    incomeGoal: p.incomeGoal,
    incomeGoalBasis: p.incomeGoalBasis,
  };
  if (tab === 'aportes') return { ...base, monthlyContribution: p.monthlyContribution };
  return base;
}
