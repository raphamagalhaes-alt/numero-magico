import { describe, expect, it } from 'vitest';
import { extraShares, reserveCoverMonths, stormLevel } from './storm';
import { ageYears, futureValue, kidPlan } from './kids';

describe('Modo tempestade', () => {
  it('liga com queda de 2% no dia ou 10% abaixo do pico de 3 meses', () => {
    expect(stormLevel({ dayPct: -0.025, closes: [100, 101], price: 99 }).reason).toBe('dia');
    const dd = stormLevel({ dayPct: -0.005, closes: [100, 120, 110], price: 105 });
    expect(dd.reason).toBe('pico');
    expect(dd.drawdown).toBeCloseTo(105 / 120 - 1);
    expect(stormLevel({ dayPct: -0.01, closes: [100, 102], price: 101 }).active).toBe(false);
    expect(stormLevel({ dayPct: null, closes: [], price: null }).active).toBe(false);
  });
  it('mesmo dinheiro compra mais cotas na queda; reserva em meses', () => {
    expect(extraShares(500, 9, 10)).toEqual({ now: 55, before: 50, extra: 5 });
    expect(extraShares(0, 9, 10).extra).toBe(0);
    expect(reserveCoverMonths(12000, 4000)).toBe(3);
    expect(reserveCoverMonths(1000, 0)).toBeNull();
  });
});

describe('Primeiro investimento dos filhos', () => {
  it('idade, valor futuro e plano', () => {
    expect(ageYears('2018-03-10', '2026-11-09')).toBe(8);
    expect(futureValue(0, 100, 12, 0)).toBe(1200);
    const p = kidPlan({ name: 'Ana', birth: '2018-03-10', goal: 'Faculdade', target: 100000, atAge: 18, monthly: 300, have: 2000 }, '2026-11-09', 0.05);
    expect(p.ageNow).toBe(8);
    expect(p.monthsLeft).toBe(18 * 12 - 104);
    expect(p.birthdays[0].age).toBe(9);
    expect(p.birthdays[p.birthdays.length - 1].age).toBe(18);
    expect(p.birthdays[p.birthdays.length - 1].value).toBeCloseTo(p.projected, 0);
    // aporte necessário leva exatamente à meta na idade escolhida
    expect(futureValue(2000, p.needed, p.monthsLeft, 0.05)).toBeGreaterThanOrEqual(99990);
    expect(p.onTrack).toBe(p.projected >= 100000);
  });
});
