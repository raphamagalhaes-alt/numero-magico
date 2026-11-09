import { describe, expect, it } from 'vitest';
import { effectivePct, payDate, splitPayday, streak } from './payday';
import { daysLabel, freedomDelayDays, monthsToTargetFrac } from './freedom';

describe('Dia do salário', () => {
  it('dia fixo que cai no fim de semana é antecipado; 5º dia útil pula fins de semana e feriados', () => {
    expect(payDate('2026-11', { kind: 'dia', day: 8 })).toBe('2026-11-06'); // 08/11/2026 é domingo
    expect(payDate('2026-02', { kind: 'dia', day: 31 })).toBe('2026-02-27'); // 28/02 é sábado
    expect(payDate('2026-11', { kind: 'util', n: 5 })).toBe('2026-11-09'); // 02/11 feriado (Finados)
  });
  it('pague-se primeiro: reserva até a meta, resto investido', () => {
    expect(splitPayday({ salary: 5000, pct: 10, reserveHave: 0, reserveTarget: 10000, reserveShare: 1 })).toEqual({ save: 500, toReserve: 500, toInvest: 0, reserveDone: false });
    expect(splitPayday({ salary: 5000, pct: 10, reserveHave: 9800, reserveTarget: 10000, reserveShare: 1 })).toEqual({ save: 500, toReserve: 200, toInvest: 300, reserveDone: false });
    expect(splitPayday({ salary: 5000, pct: 10, reserveHave: 0, reserveTarget: 10000, reserveShare: 0.5 }).toInvest).toBe(250);
    expect(splitPayday({ salary: 5000, pct: 10, reserveHave: 10000, reserveTarget: 10000, reserveShare: 1 }).reserveDone).toBe(true);
  });
  it('Poupe Mais Amanhã: sobe 1 ponto a cada 6 meses até o teto', () => {
    const r = { on: true, step: 1, everyMonths: 6, max: 15, start: '2026-01-10' };
    expect(effectivePct(10, r, '2026-05-01')).toEqual({ pct: 10, nextAt: '2026-07' });
    expect(effectivePct(10, r, '2027-02-01')).toEqual({ pct: 12, nextAt: '2027-07' });
    expect(effectivePct(10, r, '2040-01-01')).toEqual({ pct: 15, nextAt: null });
    expect(effectivePct(10, null, '2027-01-01').pct).toBe(10);
  });
  it('sequência de meses cumpridos', () => {
    expect(streak(['2026-09', '2026-10'], '2026-11')).toBe(2);
    expect(streak(['2026-09', '2026-10', '2026-11'], '2026-11')).toBe(3);
    expect(streak(['2026-08', '2026-10'], '2026-11')).toBe(1);
    expect(streak([], '2026-11')).toBe(0);
  });
});

describe('Quanto custa em liberdade', () => {
  const plan = { capital: 10000, contribution: 1000, target: 300000, rate: 0.06 };
  it('gasto atrasa, aporte extra adianta (simétrico) e assinatura pesa muito mais', () => {
    const d = freedomDelayDays(plan, { oneOff: 3000 })!;
    expect(d).toBeGreaterThan(30);
    expect(freedomDelayDays(plan, { oneOff: -3000 })!).toBeLessThan(0);
    const sub = freedomDelayDays(plan, { monthly: 50 })!;
    expect(sub).toBeGreaterThan(d / 3);
    expect(freedomDelayDays({ ...plan, capital: 0, contribution: 40 }, { monthly: 50 })).toBe(Infinity); // o gasto consome todo o aporte
    expect(freedomDelayDays({ ...plan, target: 0 }, { oneOff: 10 })).toBeNull();
  });
  it('fração de mês e rótulos', () => {
    expect(monthsToTargetFrac(0, 100, 150, 0)).toBeCloseTo(1.5);
    expect(daysLabel(47)).toBe('47 dias');
    expect(daysLabel(1)).toBe('1 dia');
    expect(daysLabel(430)).toBe('1 ano e 2 meses');
    expect(daysLabel(Infinity)).toBe('mais de 100 anos');
  });
});
