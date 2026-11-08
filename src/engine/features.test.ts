import { describe, expect, it } from 'vitest';
import { compareFixedIncome, dec, ipcaPlusNominal, monteCarlo, regressiveRate, simulate, type SimulationInput } from './index';

const base = (over: Partial<SimulationInput> = {}): SimulationInput => ({
  price: '8.89', dividend: '0.10', desiredShares: 2, months: 360,
  monthlyContribution: '0', contributionStartMonth: 2, contributionAdjustAnnual: true,
  inflationAnnual: '0.06', priceAnnualChange: '0', dividendAnnualChange: '0', dividendInitialChange: '0',
  reinvestRatio: '1', incomeGoal: '1000', incomeGoalBasis: 'nominal', ...over,
});

describe('comparação com renda fixa', () => {
  it('tabela regressiva de IR', () => {
    expect(regressiveRate(100).toFixed()).toBe('0.225');
    expect(regressiveRate(200).toFixed()).toBe('0.2');
    expect(regressiveRate(500).toFixed()).toBe('0.175');
    expect(regressiveRate(800).toFixed()).toBe('0.15');
  });
  it('aplicação única: bruto = inicial × (1+r)^30; IR 15% sobre o ganho', () => {
    const sim = simulate(base());
    const r = compareFixedIncome(sim, { label: 'CDI', annualRate: '0.10' });
    const expected = sim.summary.initialInvestment.mul(dec('1.1').pow(30));
    expect(r.gross.toFixed(2)).toBe(expected.toDecimalPlaces(2).toFixed(2));
    expect(r.tax.toFixed(2)).toBe(r.gross.sub(r.invested).mul('0.15').toDecimalPlaces(2).toFixed(2));
    expect(r.net.eq(r.gross.sub(r.tax))).toBe(true);
  });
  it('mesmos fluxos de aportes; isento não paga IR; custódia reduz o resultado', () => {
    const sim = simulate(base({ monthlyContribution: '250' }));
    const a = compareFixedIncome(sim, { label: 'LCI', annualRate: '0.10', regressiveTax: false });
    const b = compareFixedIncome(sim, { label: 'Tesouro', annualRate: '0.10', custodyAnnual: '0.002' });
    expect(a.invested.eq(sim.summary.totalInvested)).toBe(true);
    expect(a.tax.isZero()).toBe(true);
    expect(b.gross.lt(a.gross)).toBe(true);
  });
  it('IPCA+ nominal', () => {
    expect(ipcaPlusNominal('0.07', '0.04').toFixed(4)).toBe('0.1128');
  });
});

describe('regra de compra mínima (custo máximo por ordem)', () => {
  it('com custo fixo alto, acumula caixa e compra em ordens maiores', () => {
    const sem = simulate(base({ tradingCostFixed: '5', monthlyContribution: '250' }));
    const com = simulate(base({ tradingCostFixed: '5', monthlyContribution: '250', maxCostPct: '0.005' }));
    expect(com.summary.totalFees.lt(sem.summary.totalFees)).toBe(true);
    const ordens = com.rows.filter((r) => r.sharesBought > 0);
    for (const r of ordens) expect(r.purchaseFees.lte(r.price.mul(r.sharesBought).mul('0.005'))).toBe(true);
    for (const r of com.rows) expect(r.cashCarry.add(r.cashInterest).add(r.reinvested).add(r.contribution).eq(r.purchaseCost.add(r.cashEnd))).toBe(true);
  });
});

describe('Monte Carlo', () => {
  const mc = (over = {}) => monteCarlo({
    price: 8.89, dividend: 0.1, initialShares: 178, months: 360, monthlyContribution: 0, contributionStartMonth: 2, inflationAnnual: 0.06,
    priceDriftAnnual: 0, priceVolAnnual: 0.15, dividendDriftAnnual: 0, dividendVolAnnual: 0.05, incomeGoal: 1000, paths: 300, ...over,
  });
  it('reprodutível com semente; faixas ordenadas p10 ≤ p50 ≤ p90', () => {
    const a = mc(), b = mc();
    expect(a.finalEquity).toEqual(b.finalEquity);
    for (const x of a.equity) expect(x.p10 <= x.p50 && x.p50 <= x.p90).toBe(true);
    expect(a.equity).toHaveLength(30);
  });
  it('sem volatilidade converge ao caminho determinístico (± arredondamento)', () => {
    const r = mc({ priceVolAnnual: 0, dividendVolAnnual: 0, paths: 5 });
    const det = simulate(base()).summary.finalEquity.toNumber();
    expect(Math.abs(r.finalEquity.p50 - det) / det).toBeLessThan(0.002);
    expect(r.finalEquity.p10).toBeCloseTo(r.finalEquity.p90, 6);
  });
  it('desempenho: 500 trajetórias × 360 meses < 300 ms', () => {
    const t0 = performance.now();
    mc({ paths: 500 });
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
