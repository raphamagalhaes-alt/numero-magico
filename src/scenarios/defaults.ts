import { ASSETS, DEFAULT_TICKER } from '../assets/registry';
import { saoPauloDate, type SimulationInput } from '../engine';

export type MainTab = 'nominal' | 'inflacao' | 'aportes';

/** Parâmetros editáveis comuns às três abas principais (strings decimais com ponto). */
export interface BaseParams {
  ticker: string;
  price: string;
  dividend: string;
  desiredShares: number;
  inflationAnnual: string; // fração
  monthlyContribution: string;
  incomeGoal: string;
  incomeGoalBasis: 'nominal' | 'real';
  startMonth: string; // AAAA-MM do 1º pagamento
  paymentLagBusinessDays: number;
  tradingCostPct: string; // fração
  tradingCostFixed: string;
  dividendTaxRate: string; // fração
  capitalGainsTaxRate: string; // fração
  cashYieldAnnual: string; // fração
}

export const currentMonth = (now = new Date()) => saoPauloDate(now).slice(0, 7);

/** Premissas avançadas padrão: neutras, exceto o IR de 20% sobre ganho de capital em FII (pessoa física). */
export function advancedDefaults(ticker = DEFAULT_TICKER) {
  return {
    startMonth: currentMonth(),
    paymentLagBusinessDays: ASSETS[ticker]?.paymentLagBusinessDays ?? 10,
    tradingCostPct: '0',
    tradingCostFixed: '0',
    dividendTaxRate: '0',
    capitalGainsTaxRate: '0.2',
    cashYieldAnnual: '0',
  };
}

export function demoParams(ticker = DEFAULT_TICKER): BaseParams {
  const demo = ASSETS[ticker]?.demo ?? ASSETS[DEFAULT_TICKER].demo!;
  return {
    ticker,
    price: demo.price,
    dividend: demo.dividend,
    desiredShares: demo.desiredShares,
    inflationAnnual: demo.inflationAnnual,
    monthlyContribution: demo.monthlyContribution,
    incomeGoal: '1000',
    incomeGoalBasis: 'nominal',
    ...advancedDefaults(ticker),
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
    startMonth: p.startMonth || null,
    paymentLagBusinessDays: p.paymentLagBusinessDays,
    tradingCostPct: p.tradingCostPct,
    tradingCostFixed: p.tradingCostFixed,
    dividendTaxRate: p.dividendTaxRate,
    capitalGainsTaxRate: p.capitalGainsTaxRate,
    cashYieldAnnual: p.cashYieldAnnual,
  };
  if (tab === 'aportes') return { ...base, monthlyContribution: p.monthlyContribution };
  return base;
}
