/**
 * Calendário de renda dos próximos 12 meses. Rendimentos JÁ ANUNCIADOS entram como confirmados;
 * para os demais meses, repetimos o que cada ativo pagou no mesmo mês dos últimos 12 meses
 * (projeção — empresas e fundos podem pagar diferente).
 */
export interface PayEvent { ticker: string; amount: number; paymentDate: string }
export interface CalendarItem { ticker: string; amount: number; confirmed: boolean }
export interface CalendarMonth { ym: string; total: number; items: CalendarItem[] }

const cents = (v: number) => Math.round(v * 100) / 100;
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export function projectIncomeCalendar(events: PayEvent[], shares: Record<string, number>, today: string) {
  const thisYm = today.slice(0, 7);
  const months: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => ({ ym: addMonths(thisYm, i + 1), total: 0, items: [] }));
  const from = addMonths(thisYm, -11); // últimos 12 meses, incluindo o atual
  for (const t of Object.keys(shares)) {
    const n = shares[t];
    if (!(n > 0)) continue;
    const mine = events.filter((e) => e.ticker === t && e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.paymentDate));
    for (const m of months) {
      const confirmed = mine.filter((e) => e.paymentDate.slice(0, 7) === m.ym && e.paymentDate > today);
      const past = confirmed.length ? [] : mine.filter((e) => e.paymentDate <= today && e.paymentDate.slice(0, 7) >= from && e.paymentDate.slice(5, 7) === m.ym.slice(5, 7));
      const per = [...confirmed, ...past].reduce((s, e) => s + e.amount, 0);
      if (per > 0) { const amount = cents(per * n); m.items.push({ ticker: t, amount, confirmed: confirmed.length > 0 }); m.total = cents(m.total + amount); }
    }
  }
  const total = cents(months.reduce((s, m) => s + m.total, 0));
  const sorted = [...months].sort((a, b) => a.total - b.total);
  return { months, total, avg: cents(total / 12), weakest: total > 0 ? sorted[0] : null, strongest: total > 0 ? sorted[11] : null };
}

/** Teste da renda fixa: quanto a carteira paga ao ano em proventos vs. a renda fixa sem risco (líquida de IR). */
export function fixedIncomeTest(o: { income: number; value: number; selicPct: number | null; ipca12mPct: number | null; ipcaPlusRealPct: number | null; irRate?: number }) {
  const ir = o.irRate ?? 0.15; // IR de 15% para aplicações acima de 2 anos
  const portfolioYield = o.value > 0 ? (o.income * 12) / o.value : null;
  const selicNet = o.selicPct === null ? null : (o.selicPct / 100) * (1 - ir);
  const ipcaPlusNet = o.ipcaPlusRealPct === null || o.ipca12mPct === null ? null : ((1 + o.ipcaPlusRealPct / 100) * (1 + o.ipca12mPct / 100) - 1) * (1 - ir);
  const diff = portfolioYield === null || selicNet === null ? null : portfolioYield - selicNet;
  return { portfolioYield, selicNet, ipcaPlusNet, diff };
}
