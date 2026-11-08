import { describe, expect, it } from 'vitest';
import {
  addBusinessDays, affordableShares, costModel, datesAt, dec, isTradingDay, lastBusinessDayOfMonth, magicNumber,
  orderTotal, simulate, toCents, validateInput, type SimulationInput,
} from './index';

const base = (over: Partial<SimulationInput> = {}): SimulationInput => ({
  price: '8.89', dividend: '0.10', desiredShares: 2, months: 360,
  monthlyContribution: '0', contributionStartMonth: 2, contributionAdjustAnnual: true,
  inflationAnnual: '0.06', priceAnnualChange: '0', dividendAnnualChange: '0', dividendInitialChange: '0',
  reinvestRatio: '1', incomeGoal: '1000', incomeGoalBasis: 'nominal', ...over,
});

describe('datas reais de data-com e pagamento', () => {
  it('reproduz os avisos oficiais do MXRF11 (Fundos.NET): pagamento 10 dias úteis após a data-com', () => {
    // Avisos estruturados: data-base 31/08/2026 → 15/09; 30/09 → 15/10; 30/10 → 16/11.
    expect(addBusinessDays('2026-08-31', 10)).toBe('2026-09-15');
    expect(addBusinessDays('2026-09-30', 10)).toBe('2026-10-15');
    expect(addBusinessDays('2026-10-30', 10)).toBe('2026-11-16');
    expect(lastBusinessDayOfMonth('2026-10')).toBe('2026-10-30');
    expect(datesAt('2026-11', 1, 10)).toEqual({ recordDate: '2026-10-30', paymentDate: '2026-11-16' });
  });
  it('preenche as 360 linhas com datas crescentes em dias de pregão', () => {
    const r = simulate(base({ startMonth: '2026-11', paymentLagBusinessDays: 10 }));
    expect(r.rows[0].paymentDate).toBe('2026-11-16');
    expect(r.rows[1].recordDate).toBe('2026-11-30');
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].paymentDate! > r.rows[i - 1].paymentDate!).toBe(true);
      expect(isTradingDay(r.rows[i].recordDate!)).toBe(true);
      expect(isTradingDay(r.rows[i].paymentDate!)).toBe(true);
      // compra no pagamento ocorre antes da data-com seguinte → elegível no mês seguinte
      expect(r.rows[i - 1].paymentDate! <= r.rows[i].recordDate!).toBe(true);
    }
  });
});

describe('custos de negociação', () => {
  const c = costModel('0.0003', '0');
  it('compra o máximo que cabe incluindo custos', () => {
    const n = affordableShares(dec('17.80'), dec('8.89'), c);
    expect(n).toBe(2);
    expect(orderTotal(2, dec('8.89'), c).toFixed(2)).toBe('17.79'); // 17,78 + 0,01
    expect(affordableShares(dec('17.78'), dec('8.89'), c)).toBe(1);
  });
  it('custo fixo maior que o disponível impede a compra', () => {
    expect(affordableShares(dec('17.80'), dec('8.89'), costModel(0, '20'))).toBe(0);
  });
  it('número mágico considera custos; caixa conserva com custos', () => {
    const m = magicNumber('8.89', '0.10', 2, { tradingCostPct: '0.0003' });
    expect(m.shares).toBe(178); // 17,80 ≥ 17,79
    const m2 = magicNumber('8.89', '0.10', 2, { tradingCostFixed: '1.00' });
    expect(m2.shares).toBe(188); // 18,78 / 0,10
    const r = simulate(base({ tradingCostPct: '0.0003', tradingCostFixed: '0.50', monthlyContribution: '250' }));
    for (const x of r.rows) {
      expect(x.cashCarry.add(x.cashInterest).add(x.reinvested).add(x.contribution).eq(x.purchaseCost.add(x.cashEnd))).toBe(true);
      expect(x.purchaseCost.eq(x.price.mul(x.sharesBought).add(x.purchaseFees))).toBe(true);
      expect(x.cashEnd.gte(0)).toBe(true);
    }
    expect(r.summary.totalFees.gt(0)).toBe(true);
  });
});

describe('tributação', () => {
  it('IR sobre rendimentos reduz o líquido e eleva o número mágico', () => {
    const m = magicNumber('8.89', '0.10', 2, { dividendTaxRate: '0.15' });
    // líquido de n cotas = cent(0,10n) − cent(15%); precisa ≥ 17,78 → n = 210 (21,00 − 3,15 = 17,85); 209 → 20,90 − 3,14 = 17,76
    expect(m.shares).toBe(210);
    const r = simulate(base({ dividendTaxRate: '0.15', initialSharesOverride: 178 }));
    expect(r.rows[0].dividendTax.toFixed(2)).toBe('2.67');
    expect(r.rows[0].netIncome.toFixed(2)).toBe('15.13');
    for (const x of r.rows) expect(x.income.eq(x.dividendTax.add(x.reinvested).add(x.withdrawn))).toBe(true);
  });
  it('isento (0%) mantém o resultado original', () => {
    expect(simulate(base({ dividendTaxRate: '0' })).summary.finalEquity.eq(simulate(base()).summary.finalEquity)).toBe(true);
  });
  it('IR de 20% sobre ganho de capital na venda hipotética', () => {
    const r = simulate(base({ capitalGainsTaxRate: '0.20', priceAnnualChange: '0.05' }));
    const x = r.rows[359];
    const gain = x.sharesValue.sub(x.costBasis);
    expect(gain.gt(0)).toBe(true);
    expect(x.liquidationCosts.toFixed(2)).toBe(toCents(gain.mul('0.2')).toFixed(2));
    expect(x.netLiquidationEquity.eq(x.totalEquity.sub(x.liquidationCosts))).toBe(true);
  });
  it('sem ganho de capital não há IR na venda', () => {
    const r = simulate(base({ capitalGainsTaxRate: '0.20' }));
    expect(r.rows[359].liquidationCosts.isZero()).toBe(true);
  });
});

describe('remuneração do caixa residual', () => {
  it('rende juros truncados sobre a sobra anterior', () => {
    const r = simulate(base({ cashYieldAnnual: '0.12', price: '100', dividend: '0.5', initialSharesOverride: 100 }));
    // mês 1: 50,00 sem compra (preço 100) → sobra 50; mês 2: juros = trunc(50 × ((1,12)^(1/12) − 1)) = 0,47
    expect(r.rows[0].cashEnd.toFixed(2)).toBe('50.00');
    expect(r.rows[1].cashInterest.toFixed(2)).toBe('0.47');
    expect(r.summary.totalCashInterest.gt(0)).toBe(true);
  });
});

describe('validação das novas premissas', () => {
  it('rejeita valores fora da faixa', () => {
    const f = validateInput(base({ tradingCostPct: '-0.1', dividendTaxRate: '1.2', tradingCostFixed: '-1', startMonth: '2026-13', paymentLagBusinessDays: -1 })).map((i) => i.field);
    expect(f).toEqual(expect.arrayContaining(['tradingCostPct', 'dividendTaxRate', 'tradingCostFixed', 'startMonth', 'paymentLagBusinessDays']));
  });
});
