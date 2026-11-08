import { describe, expect, it } from 'vitest';
import { fixedIncomeTest, projectIncomeCalendar } from './income-calendar';
import { decodeCard, encodeCard } from '../family/share';

describe('Calendário de renda', () => {
  const ev = [
    // FII mensal: pagou R$ 0,10 todo mês no último ano
    ...Array.from({ length: 12 }, (_, i) => ({ ticker: 'FII11', amount: 0.1, paymentDate: `${i < 10 ? 2026 : 2025}-${String(i < 10 ? i + 1 : i + 1).padStart(2, '0')}-15` })),
    // ação: pagou em março e agosto
    { ticker: 'ACAO3', amount: 1, paymentDate: '2026-03-20' }, { ticker: 'ACAO3', amount: 2, paymentDate: '2026-08-20' },
    // anunciado: dezembro/2026 de R$ 0,50 (confirmado, substitui a projeção)
    { ticker: 'ACAO3', amount: 0.5, paymentDate: '2026-12-10' },
  ];
  const r = projectIncomeCalendar(ev, { FII11: 100, ACAO3: 10 }, '2026-11-08');
  it('projeta os próximos 12 meses e marca o que já foi anunciado', () => {
    expect(r.months[0].ym).toBe('2026-12');
    expect(r.months[11].ym).toBe('2027-11');
    const dez = r.months[0];
    expect(dez.items.find((i) => i.ticker === 'ACAO3')).toEqual({ ticker: 'ACAO3', amount: 5, confirmed: true });
    expect(r.months.find((m) => m.ym === '2027-03')!.total).toBe(20); // 10 FII + 10 ação
    expect(r.months.find((m) => m.ym === '2027-08')!.total).toBe(30);
    expect(r.weakest!.total).toBeLessThan(r.strongest!.total);
    expect(r.avg).toBeCloseTo(r.total / 12, 2);
  });
  it('sem posição ou sem eventos: calendário vazio', () => {
    expect(projectIncomeCalendar(ev, {}, '2026-11-08').total).toBe(0);
    expect(projectIncomeCalendar([], { X: 10 }, '2026-11-08').weakest).toBeNull();
  });
});

describe('Teste da renda fixa', () => {
  it('compara o rendimento da carteira com Selic e IPCA+ líquidos de IR (15%)', () => {
    const t = fixedIncomeTest({ income: 100, value: 12000, selicPct: 15, ipca12mPct: 5, ipcaPlusRealPct: 7 });
    expect(t.portfolioYield).toBeCloseTo(0.1);
    expect(t.selicNet).toBeCloseTo(0.1275);
    expect(t.ipcaPlusNet).toBeCloseTo((1.07 * 1.05 - 1) * 0.85);
    expect(t.diff).toBeCloseTo(-0.0275);
    expect(fixedIncomeTest({ income: 0, value: 0, selicPct: null, ipca12mPct: null, ipcaPlusRealPct: null }).diff).toBeNull();
  });
});

describe('Metas da família (código para compartilhar)', () => {
  const card = { name: 'Mãe', pct: 0.234, covered: ['Internet', 'Luz'], next: 'Água', date: '2026-11-08', income: 300, total: 4000 };
  it('ida e volta sem valores por padrão; com valores só se a pessoa quiser', () => {
    const noVal = decodeCard(encodeCard(card, false))!;
    expect(noVal).toEqual({ name: 'Mãe', pct: 0.234, covered: ['Internet', 'Luz'], next: 'Água', date: '2026-11-08' });
    expect(decodeCard(encodeCard(card, true))!.income).toBe(300);
    // aceita o código no meio de uma mensagem do WhatsApp
    expect(decodeCard(`Olha meu progresso: ${encodeCard(card, false)} 🙂`)!.name).toBe('Mãe');
  });
  it('rejeita códigos inválidos ou adulterados e limpa textos', () => {
    expect(decodeCard('qualquer coisa')).toBeNull();
    expect(decodeCard('NM1:@@@')).toBeNull();
    expect(decodeCard('NM1:' + btoa(JSON.stringify({ name: 'x', pct: 5, covered: [], date: '2026-01-01' })))).toBeNull();
    const evil = decodeCard('NM1:' + btoa(JSON.stringify({ name: '<script>alert(1)</script>', pct: 0.5, covered: ['<b>'], next: null, date: '2026-01-01' })))!;
    expect(evil.name).not.toMatch(/[<>]/);
  });
});
