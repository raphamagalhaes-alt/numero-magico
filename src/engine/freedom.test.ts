import { describe, expect, it } from 'vitest';
import { incrementalFreedomPlan, freedomDelayDays, monthsToTargetFrac, billTimeline, capitalForIncome, contributionFor, coverage, monthsToTarget, planContribution } from './freedom';

const bills = [{ name: 'Internet', amount: 100 }, { name: 'Luz', amount: 150 }, { name: 'Mercado', amount: 1000 }];

describe('Índice de Liberdade', () => {
  it('cobre as contas na ordem escolhida e diz quanto falta para a próxima', () => {
    const c = coverage(bills, 300);
    expect(c.total).toBe(1250);
    expect(c.covered.map((b) => b.name)).toEqual(['Internet', 'Luz']);
    expect(c.next).toEqual({ bill: bills[2], have: 50, missing: 950 });
    expect(c.pct).toBeCloseTo(0.24);
    expect(coverage(bills, 2000).surplus).toBe(750);
    expect(coverage([], 100).pct).toBe(0);
  });
  it('capital para gerar a renda com a taxa real (R$ 1.000/mês a 6% real = R$ 200 mil)', () => {
    expect(capitalForIncome(1000, 0.06)).toBe(200000);
    expect(capitalForIncome(1000, 0)).toBeNull();
  });
  it('tempo e aporte necessários são consistentes entre si', () => {
    const pmt = contributionFor(10000, 200000, 180, 0.06);
    expect(pmt).toBeGreaterThan(500);
    expect(monthsToTarget(10000, pmt, 200000, 0.06)).toBe(180);
    expect(monthsToTarget(250000, 0, 200000, 0.06)).toBe(0);
    expect(monthsToTarget(0, 0, 1000, 0.06)).toBeNull();
    expect(contributionFor(300000, 200000, 120, 0.06)).toBe(0);
  });
  it('linha do tempo: contas mais baratas primeiro, datas crescentes', () => {
    const t = billTimeline(bills, 0, 5000, 500, 0.06);
    expect(t[0].capital).toBe(20000);
    expect(t.map((x) => x.months!)).toEqual([...t.map((x) => x.months!)].sort((a, b) => a - b));
    expect(billTimeline(bills, 120, 0, 0, 0.06)[0].capital).toBe(0); // outra renda já paga a internet
  });
});

describe('Aporte do mês (cotas inteiras rumo à divisão escolhida)', () => {
  it('compra o que está mais abaixo do alvo, sem passar do dinheiro', () => {
    const r = planContribution([
      { ticker: 'AAA', shares: 100, price: 10, target: 50 },
      { ticker: 'BBB', shares: 0, price: 100, target: 50 },
    ], 1000);
    // total depois = 2000 → alvo 1000 cada; BBB está 1000 abaixo → 10 cotas a R$ 100
    expect(r.buys).toEqual([{ ticker: 'BBB', shares: 10, cost: 1000 }]);
    expect(r.leftover).toBe(0);
    expect(r.after.find((a) => a.ticker === 'BBB')!.weight).toBeCloseTo(0.5);
  });
  it('dinheiro insuficiente para uma cota → nada a comprar; alvo zero é ignorado', () => {
    expect(planContribution([{ ticker: 'X', shares: 0, price: 500, target: 100 }], 100).buys).toEqual([]);
    const r = planContribution([{ ticker: 'A', shares: 0, price: 10, target: 0 }, { ticker: 'B', shares: 0, price: 10, target: 1 }], 55);
    expect(r.buys).toEqual([{ ticker: 'B', shares: 5, cost: 50 }]);
    expect(r.leftover).toBe(5);
  });
});


describe('mesma base incremental em todas as ferramentas de liberdade', () => {
  it('não reinveste uma segunda vez o patrimônio cuja renda já paga contas', () => {
    // R$ 100 mil já geram R$ 500/mês e pagam metade das contas de R$ 1.000.
    const { missingCapital, projection } = incrementalFreedomPlan(1000 - 500, 500, 0.06);
    expect(missingCapital).toBe(100000);
    expect(projection.capital).toBe(0);
    const months = monthsToTarget(projection.capital, projection.contribution, projection.target, projection.rate);
    expect(months).toBe(141);
    expect(Math.ceil(monthsToTargetFrac(projection.capital, projection.contribution, projection.target, projection.rate)!)).toBe(months);
    expect(billTimeline([{ name: 'Contas', amount: 1000 }], 500, 0, 500, 0.06)[0].months).toBe(months);
    expect(freedomDelayDays(projection, { oneOff: 1000 })).toBeGreaterThan(0);
    expect(freedomDelayDays(projection, { oneOff: -1000 })).toBeLessThan(0);
  });
  it('não inventa prazo quando não há rendimento ou falta de renda', () => {
    expect(incrementalFreedomPlan(500, 500, 0).missingCapital).toBeNull();
    expect(freedomDelayDays(incrementalFreedomPlan(500, 500, 0).projection, { oneOff: 100 })).toBeNull();
    expect(incrementalFreedomPlan(-100, 500, 0.06).projection.target).toBe(0);
  });
});
