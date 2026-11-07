import { describe, expect, it } from 'vitest';
import {
  compareStrategies, contributionAt, dec, deflatorAt, magicNumber, simulate, toCents, validateInput,
  InvalidSimulationInput, type SimulationInput,
} from './index';
import { inputForTab, demoParams } from '../scenarios/defaults';
import { fmtBRL } from '../ui/format';

const base = (over: Partial<SimulationInput> = {}): SimulationInput => ({
  price: '8.89', dividend: '0.10', desiredShares: 2, months: 360,
  monthlyContribution: '0', contributionStartMonth: 2, contributionAdjustAnnual: true,
  inflationAnnual: '0.06', priceAnnualChange: '0', dividendAnnualChange: '0', dividendInitialChange: '0',
  reinvestRatio: '1', incomeGoal: '1000', incomeGoalBasis: 'nominal', ...over,
});
const s2 = (v: { toFixed(n: number): string }) => v.toFixed(2);

describe('arredondamento', () => {
  it('half-up em centavos', () => {
    expect(toCents('17.575').toFixed(2)).toBe('17.58');
    expect(toCents('17.574999').toFixed(2)).toBe('17.57');
    expect(toCents('0.005').toFixed(2)).toBe('0.01');
  });
  it('formatação brasileira', () => {
    expect(fmtBRL('1582.42')).toBe('R$ 1.582,42');
    expect(fmtBRL('1234567.891')).toBe('R$ 1.234.567,89');
  });
});

describe('Caso obrigatório 1 — preço 8,89, dividendo 0,10, meta 2 cotas', () => {
  const r = simulate(base());
  const m1 = r.rows[0];
  it('número mágico e investimento inicial', () => {
    expect(r.magic.shares).toBe(178);
    expect(r.magic.theoreticalShares).toBe(178);
    expect(s2(r.magic.initialInvestment)).toBe('1582.42');
    expect(fmtBRL(r.magic.initialInvestment)).toBe('R$ 1.582,42');
    expect(s2(r.magic.firstIncome)).toBe('17.80');
  });
  it('mês 1', () => {
    expect(m1.sharesStart).toBe(178);
    expect(s2(m1.income)).toBe('17.80');
    expect(m1.sharesBought).toBe(2);
    expect(s2(m1.cashEnd)).toBe('0.02');
    expect(m1.sharesEnd).toBe(180);
    expect(s2(m1.sharesValue)).toBe('1600.20');
    expect(s2(m1.totalEquity)).toBe('1600.22');
  });
  it('cotas compradas no mês atual só rendem no mês seguinte', () => {
    expect(r.rows[1].sharesStart).toBe(180);
    expect(s2(r.rows[1].income)).toBe('18.00');
    expect(s2(r.rows[1].available)).toBe('18.02');
  });
});

describe('Caso obrigatório 2 — preço 8,80, dividendo 0,095', () => {
  const r = simulate(base({ price: '8.80', dividend: '0.095' }));
  it('resultados', () => {
    expect(r.magic.shares).toBe(186);
    expect(s2(r.magic.initialInvestment)).toBe('1636.80');
    expect(s2(r.rows[0].income)).toBe('17.67');
    expect(r.rows[0].sharesBought).toBe(2);
    expect(s2(r.rows[0].cashEnd)).toBe('0.07');
  });
});

describe('número mágico com quantização em centavos', () => {
  it('reduz cotas quando o arredondamento half-up já cobre o custo', () => {
    // 2 × 1,00 = 2,00; 0,0125 → teórico 160; 159 × 0,0125 = 1,9875 → R$ 1,99 (não cobre);
    // com dividendo 0,0333: teórico teto(60,06)=61; 60 × 0,0333 = 1,998 → R$ 2,00 (cobre) → 60.
    const m = magicNumber('1.00', '0.0333', 2);
    expect(m.theoreticalShares).toBe(61);
    expect(m.shares).toBe(60);
    expect(m.quantizationAdjusted).toBe(true);
    expect(toCents(dec('0.0333').mul(60)).gte(dec(2))).toBe(true);
    expect(toCents(dec('0.0333').mul(59)).lt(dec(2))).toBe(true);
  });
  it('aumenta cotas quando o custo tem mais de 2 casas', () => {
    // custo 2 × 1,0049 = 2,0098; dividendo 0,01 → teórico 201 → rende 2,01 ≥ 2,0098 OK.
    const m = magicNumber('1.0049', '0.01', 2);
    expect(toCents(dec('0.01').mul(m.shares)).gte(m.targetCost)).toBe(true);
    expect(toCents(dec('0.01').mul(m.shares - 1)).lt(m.targetCost)).toBe(true);
  });
});

describe('dividendo zero', () => {
  it('não existe número mágico finito', () => {
    const m = magicNumber('8.89', '0', 2);
    expect(m.finite).toBe(false);
  });
  it('simulação roda sem criar dividendos', () => {
    const r = simulate(base({ dividend: '0', initialSharesOverride: 100 }));
    expect(r.rows.every((x) => x.income.isZero() && x.sharesBought === 0)).toBe(true);
    expect(r.summary.finalShares).toBe(100);
  });
});

describe('simulação completa', () => {
  const r = simulate(base());
  it('possui exatamente 360 linhas', () => {
    expect(r.rows).toHaveLength(360);
    expect(r.rows[359].month).toBe(360);
    expect(r.rows[359].year).toBe(30);
  });
  it('conservação financeira do caixa em todos os períodos', () => {
    let prevEnd = 0;
    for (const x of r.rows) {
      expect(Number.isInteger(x.sharesBought) && Number.isInteger(x.sharesEnd)).toBe(true);
      expect(x.cashCarry.add(x.reinvested).add(x.contribution).eq(x.purchaseCost.add(x.cashEnd))).toBe(true);
      expect(x.income.eq(x.reinvested.add(x.withdrawn))).toBe(true);
      expect(x.cashEnd.gte(0) && x.cashEnd.lt(x.price)).toBe(true);
      expect(x.totalEquity.eq(x.sharesValue.add(x.cashEnd))).toBe(true);
      expect(x.sharesStart).toBe(x.month === 1 ? 178 : prevEnd);
      expect(x.income.eq(toCents(x.dividendPerShare.mul(x.sharesStart)))).toBe(true);
      prevEnd = x.sharesEnd;
    }
  });
  it('recordes estritos de compra', () => {
    const recs = r.rows.filter((x) => x.isPurchaseRecord);
    for (let i = 1; i < recs.length; i++) expect(recs[i].sharesBought).toBeGreaterThan(recs[i - 1].sharesBought);
    expect(recs[0].month).toBe(1);
  });
});

describe('inflação e valores reais', () => {
  it('real = nominal / (1+i)^(t/12)', () => {
    const r = simulate(base());
    const x = r.rows[11];
    expect(x.realEquity.toFixed(10)).toBe(x.totalEquity.div(dec('1.06')).toFixed(10));
    const x6 = r.rows[5];
    expect(x6.deflator.toFixed(12)).toBe(dec('1.06').pow(dec(6).div(12)).toFixed(12));
  });
  it('inflação zero: real = nominal', () => {
    const r = simulate(base({ inflationAnnual: '0' }));
    expect(r.rows.every((x) => x.realEquity.eq(x.totalEquity))).toBe(true);
  });
  it('inflação negativa válida (deflação) aumenta o valor real', () => {
    const r = simulate(base({ inflationAnnual: '-0.02' }));
    const x = r.rows[23];
    expect(x.realEquity.gt(x.totalEquity)).toBe(true);
    expect(deflatorAt(dec('-0.02'), 24).toFixed(10)).toBe(dec('0.98').pow(2).toFixed(10));
  });
  it('inflação ≤ −100% é inválida', () => {
    expect(validateInput(base({ inflationAnnual: '-1' })).map((i) => i.field)).toContain('inflationAnnual');
  });
});

describe('aportes mensais', () => {
  const inp = base({ monthlyContribution: '250' });
  const r = simulate(inp);
  it('sem aporte no mês 1; começa no mês 2', () => {
    expect(r.rows[0].contribution.isZero()).toBe(true);
    expect(s2(r.rows[1].contribution)).toBe('250.00');
    expect(s2(r.rows[11].contribution)).toBe('250.00');
  });
  it('reajuste anual no mês 13 e 25', () => {
    expect(s2(r.rows[12].contribution)).toBe('265.00');
    expect(s2(r.rows[23].contribution)).toBe('265.00');
    expect(s2(r.rows[24].contribution)).toBe('280.90');
    expect(s2(contributionAt(inp, 37))).toBe(s2(toCents(dec(250).mul(dec('1.06').pow(3)))));
  });
  it('total aportado = soma dos aportes; patrimônio separado do aportado', () => {
    const sum = r.rows.reduce((a, x) => a.add(x.contribution), dec(0));
    expect(r.summary.totalContributions.eq(sum)).toBe(true);
    expect(r.summary.totalInvested.eq(r.magic.initialInvestment.add(sum))).toBe(true);
    expect(r.summary.growthOverInvested.eq(r.summary.finalEquity.sub(r.summary.totalInvested))).toBe(true);
  });
});

describe('meta de renda', () => {
  it('meta atingida: primeiro mês com renda do início do mês ≥ meta', () => {
    const r = simulate(base({ monthlyContribution: '250', incomeGoal: '1000' }));
    const m = r.summary.goalMonth!;
    expect(m).not.toBeNull();
    expect(r.rows[m - 1].income.gte(1000)).toBe(true);
    expect(r.rows[m - 2].income.lt(1000)).toBe(true);
    expect(r.rows.filter((x) => x.isGoalMonth)).toHaveLength(1);
  });
  it('meta real exige mais tempo que nominal com inflação positiva', () => {
    const n = simulate(base({ monthlyContribution: '250', incomeGoalBasis: 'nominal' })).summary.goalMonth!;
    const rr = simulate(base({ monthlyContribution: '250', incomeGoalBasis: 'real' })).summary.goalMonth;
    expect(rr === null || rr > n).toBe(true);
  });
  it('meta não atingida em 360 meses', () => {
    const r = simulate(base({ incomeGoal: '100000000' }));
    expect(r.summary.goalMonth).toBeNull();
    expect(r.summary.goalProgress.lt(1)).toBe(true);
  });
});

describe('estratégias de reinvestimento', () => {
  const out = compareStrategies(base());
  it('100% não retira nada; 0% não compra cotas sem aportes', () => {
    expect(out[0].cashReceived.isZero()).toBe(true);
    expect(out[2].finalShares).toBe(178);
    expect(out[2].cashReceived.eq(dec('17.80').mul(360))).toBe(true);
  });
  it('sem dupla contagem: patrimônio investido não inclui dividendos retirados', () => {
    const half = out[1].result;
    for (const x of half.rows) {
      expect(x.totalEquity.eq(x.sharesValue.add(x.cashEnd))).toBe(true);
    }
    expect(half.summary.totalIncome.eq(half.summary.totalReinvested.add(half.summary.totalWithdrawn))).toBe(true);
  });
  it('reinvestir mais gera mais cotas', () => {
    expect(out[0].finalShares).toBeGreaterThan(out[1].finalShares);
    expect(out[1].finalShares).toBeGreaterThan(out[2].finalShares);
  });
});

describe('cenários com variação de preço/dividendo', () => {
  it('dividendo derivado é truncado (nunca criado artificialmente)', () => {
    const r = simulate(base({ dividendInitialChange: '-0.1', dividendAnnualChange: '0.0333333' }));
    expect(r.rows[0].dividendPerShare.toFixed()).toBe('0.09');
    expect(r.rows[12].dividendPerShare.lte(dec('0.09').mul(dec('1.0333333')))).toBe(true);
  });
  it('preço muda a cada 12 meses e permanece em centavos', () => {
    const r = simulate(base({ priceAnnualChange: '0.05' }));
    expect(s2(r.rows[11].price)).toBe('8.89');
    expect(r.rows[12].price.toFixed()).toBe('9.33');
  });
});

describe('validações e mudanças de parâmetros', () => {
  it('rejeita parâmetros inválidos', () => {
    expect(() => simulate(base({ price: '0' }))).toThrow(InvalidSimulationInput);
    const fields = validateInput(base({ price: '-1', dividend: '-0.1', monthlyContribution: '-5', desiredShares: 1.5 })).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['price', 'dividend', 'monthlyContribution', 'desiredShares']));
    expect(validateInput(base({ price: 'abc' }))[0].field).toBe('price');
    expect(validateInput(base({ price: Number.POSITIVE_INFINITY }))[0].field).toBe('price');
  });
  it('mudanças instantâneas: nova entrada gera novo resultado sem estado residual', () => {
    const a = simulate(base());
    const b = simulate(base({ desiredShares: 3 }));
    const c = simulate(base());
    expect(b.magic.shares).toBe(267); // teto(26,67/0,10)
    expect(c.summary.finalEquity.eq(a.summary.finalEquity)).toBe(true);
  });
  it('abas: nominal sem aportes e aportes com R$ 250', () => {
    const p = demoParams();
    expect(simulate(inputForTab(p, 'nominal')).summary.totalContributions.isZero()).toBe(true);
    expect(s2(simulate(inputForTab(p, 'aportes')).rows[1].contribution)).toBe('250.00');
  });
});
