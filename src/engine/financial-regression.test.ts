import { describe, expect, it } from 'vitest';
import { annualIrr, dec, monteCarlo, simulate, type SimulationInput } from './index';
import type { MonteCarloInput } from './montecarlo';

const input = (patch: Partial<SimulationInput> = {}): SimulationInput => ({
  price: '100', dividend: '1', desiredShares: 1, initialSharesOverride: 100, months: 360,
  monthlyContribution: '0', contributionStartMonth: 2, contributionAdjustAnnual: true,
  inflationAnnual: '0.06', priceAnnualChange: '0', dividendAnnualChange: '0', dividendInitialChange: '0',
  reinvestRatio: '1', incomeGoal: '1000', incomeGoalBasis: 'nominal', ...patch,
});
const stochastic = (i: SimulationInput, patch: Partial<MonteCarloInput> = {}) => monteCarlo({
  price: Number(i.price), dividend: Number(i.dividend), initialShares: i.initialSharesOverride!, months: i.months,
  monthlyContribution: Number(i.monthlyContribution), contributionStartMonth: i.contributionStartMonth,
  contributionAdjustAnnual: i.contributionAdjustAnnual, inflationAnnual: Number(i.inflationAnnual),
  dividendInitialChange: Number(i.dividendInitialChange), reinvestRatio: Number(i.reinvestRatio),
  dividendTaxRate: Number(i.dividendTaxRate ?? 0), tradingCostPct: Number(i.tradingCostPct ?? 0),
  tradingCostFixed: Number(i.tradingCostFixed ?? 0), cashYieldAnnual: Number(i.cashYieldAnnual ?? 0),
  maxCostPct: i.maxCostPct == null ? null : Number(i.maxCostPct), incomeGoalBasis: i.incomeGoalBasis,
  incomeGoal: Number(i.incomeGoal), priceDriftAnnual: 0, priceVolAnnual: 0,
  dividendDriftAnnual: 0, dividendVolAnnual: 0, paths: 3, ...patch,
});

describe('TIR com horizontes longos', () => {
  it.each([12, 360, 1200])('retorno zero em %i meses', (months) => {
    expect(simulate(input({ months, dividend: '0' })).summary.irrAnnual).toBe(0);
  });
  it('rendimento baixo não converge para o limite superior', () => {
    const s = simulate(input({ dividend: '0.1' })).summary;
    const expected = Math.pow(s.finalEquity.toNumber() / s.initialInvestment.toNumber(), 1 / 30) - 1;
    expect(s.irrAnnual).toBeCloseTo(expected, 10);
    expect(s.irrAnnual!).toBeLessThan(0.02);
  });
  it('perda e aportes permanecem finitos', () => {
    const s = simulate(input({ dividend: '0', priceAnnualChange: '-0.03' })).summary;
    const expected = Math.pow(s.finalEquity.toNumber() / s.initialInvestment.toNumber(), 1 / 30) - 1;
    expect(s.irrAnnual).toBeCloseTo(expected, 10);
    expect(simulate(input({ dividend: '0', monthlyContribution: '500' })).summary.irrAnnual).toBeCloseTo(0, 10);
  });
  it('linhas vazias não lançam exceção', () => {
    expect(annualIrr(dec(1000), [], dec(0))).toEqual({ irrAnnual: null, irrAnnualReal: null });
  });
});

describe('Monte Carlo respeita as premissas da simulação', () => {
  it.each([
    { dividendTaxRate: '0.2' },
    { reinvestRatio: '0' },
    { reinvestRatio: '0.5', dividendInitialChange: '-0.2' },
    { tradingCostFixed: '5', tradingCostPct: '0.001', maxCostPct: '0.01' },
    { monthlyContribution: '250.51', contributionAdjustAnnual: false },
    { monthlyContribution: '250.51', contributionAdjustAnnual: true },
    { cashYieldAnnual: '0.06', tradingCostFixed: '5', maxCostPct: '0.01' },
  ])('volatilidade zero reproduz patrimônio e renda: %j', (patch) => {
    const i = input(patch);
    const det = simulate(i);
    const mc = stochastic(i);
    expect(mc.finalEquity.p50).toBeCloseTo(det.summary.finalEquity.toNumber(), 2);
    expect(mc.income.at(-1)!.p50).toBeCloseTo(det.summary.finalIncome.toNumber(), 2);
    expect(mc.finalEquity.p10).toBe(mc.finalEquity.p90);
  });
  it('preserva dividendos decimais no corte inicial e variação anual sem volatilidade', () => {
    for (const dividendAnnualChange of ['0', '-0.03']) {
      const i = input({ price: '8.89', dividend: '0.1', initialSharesOverride: 178, dividendInitialChange: '-0.3',
        dividendAnnualChange, dividendTaxRate: '0.2', tradingCostFixed: '0.15', tradingCostPct: '0.001', monthlyContribution: '250.51' });
      const det = simulate(i);
      const mc = stochastic(i, { dividendDriftAnnual: Number(dividendAnnualChange) });
      expect(mc.finalEquity.p50).toBeCloseTo(det.summary.finalEquity.toNumber(), 2);
      expect(mc.income.at(-1)!.p50).toBeCloseTo(det.summary.finalIncome.toNumber(), 2);
    }
  });
  it('usa renda líquida e a base real ao avaliar a meta', () => {
    const i = input({ months: 12, incomeGoal: '99', reinvestRatio: '0', incomeGoalBasis: 'real', inflationAnnual: '0.5' });
    expect(stochastic(i).goalProbability).toBe(0);
    expect(stochastic({ ...i, incomeGoalBasis: 'nominal' }).goalProbability).toBe(1);
    expect(stochastic({ ...i, incomeGoalBasis: 'nominal', dividendTaxRate: '0.2' }).goalProbability).toBe(0);
  });
  it.each([1, 13, 25])('inclui o último período de %i meses', (months) => {
    const i = input({ months });
    const mc = stochastic(i);
    expect(mc.equity).toHaveLength(Math.ceil(months / 12));
    expect(mc.equity.at(-1)!.year).toBe(months / 12);
    expect(mc.finalEquity.p50).toBeCloseTo(simulate(i).summary.finalEquity.toNumber(), 2);
  });
  it('trajetórias extremas não travam ao ultrapassar a precisão inteira', () => {
    const mc = stochastic(input(), { price: 0.01, dividend: 1, months: 60 });
    expect(Number.isFinite(mc.finalEquity.p50)).toBe(true);
    expect(mc.finalEquity.p50).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });
  it('rejeita horizonte ou quantidade de trajetórias vazios', () => {
    expect(() => stochastic(input(), { months: 0 })).toThrow(RangeError);
    expect(() => stochastic(input(), { paths: 0 })).toThrow(RangeError);
  });
});
