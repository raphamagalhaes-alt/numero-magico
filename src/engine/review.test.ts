import { describe, expect, it } from 'vitest';
import { dec, deflatorAt, simulate, validateInput, type SimulationInput } from './index';
import { buildScenarioInput, SCENARIOS } from '../scenarios/scenarios';

const base = (over: Partial<SimulationInput> = {}): SimulationInput => ({
  price: '8.89', dividend: '0.10', desiredShares: 2, months: 360,
  monthlyContribution: '0', contributionStartMonth: 2, contributionAdjustAnnual: true,
  inflationAnnual: '0.06', priceAnnualChange: '0', dividendAnnualChange: '0', dividendInitialChange: '0',
  reinvestRatio: '1', incomeGoal: '1000', incomeGoalBasis: 'nominal', ...over,
});

describe('correções da revisão', () => {
  it('deflator acumulado = (1+i)^(t/12) com precisão de 20 casas no mês 360', () => {
    const r = simulate(base());
    expect(r.rows[359].deflator.toFixed(20)).toBe(deflatorAt(dec('0.06'), 360).toFixed(20));
    expect(r.rows[359].deflator.toFixed(10)).toBe(dec('1.06').pow(30).toFixed(10));
  });
  it('desempenho: simulação de 360 meses abaixo de 60 ms', () => {
    simulate(base());
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) simulate(base({ monthlyContribution: '250' }));
    expect((performance.now() - t0) / 5).toBeLessThan(60);
  });
  it('meta atingida e depois perdida em termos reais é sinalizada', () => {
    const s = simulate(base({ inflationAnnual: '0.16', incomeGoal: '17', incomeGoalBasis: 'real' })).summary;
    expect(s.goalMonth).toBe(1);
    expect(s.goalSustained).toBe(false);
    expect(s.goalLastMissMonth).toBeGreaterThan(1);
  });
  it('meta sustentada no caso nominal com aportes', () => {
    const s = simulate(base({ monthlyContribution: '250' })).summary;
    expect(s.goalSustained).toBe(true);
  });
  it('TIR: sem aportes e preço/dividendo constantes ≈ rendimento composto; real = nominal deflacionada', () => {
    const s = simulate(base()).summary;
    // dividendo 0,10 / 8,89 ao mês ≈ 1,125% a.m. → ≈ 14,4% a.a. (sobras e quantização reduzem levemente)
    expect(s.irrAnnual!).toBeGreaterThan(0.13);
    expect(s.irrAnnual!).toBeLessThan(0.145);
    expect(s.irrAnnualReal!).toBeCloseTo((1 + s.irrAnnual!) / 1.06 - 1, 10);
  });
  it('prazo de pagamento acima de 15 dias úteis é rejeitado', () => {
    expect(validateInput(base({ paymentLagBusinessDays: 16 })).map((i) => i.field)).toContain('paymentLagBusinessDays');
  });
  it('cenários Estável/Conservador/Otimista herdam aporte e inflação da base', () => {
    const b = base({ monthlyContribution: '250', inflationAnnual: '0.05' });
    for (const k of ['estavel', 'conservador', 'otimista'] as const) {
      const i = buildScenarioInput(b, k, SCENARIOS.find((s) => s.kind === k)!.defaults);
      expect(i.monthlyContribution).toBe('250');
      expect(i.inflationAnnual).toBe('0.05');
    }
  });
});
