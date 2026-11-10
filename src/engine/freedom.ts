/**
 * Liberdade financeira em linguagem de contas da casa. Tudo em REAIS DE HOJE: a rentabilidade usada
 * é a REAL (acima da inflação), e a renda "sustentável" é capital × taxa real — viver da renda sem
 * consumir o poder de compra do patrimônio. Hipóteses simples e explícitas; não é recomendação.
 */
export interface Bill { name: string; amount: number }
const cents = (v: number) => Math.round(v * 100) / 100;

export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** Quais contas a renda passiva já cobre, na ordem escolhida pela pessoa. */
export function coverage(bills: Bill[], income: number) {
  const valid = bills.filter((b) => b.amount > 0);
  const total = cents(valid.reduce((s, b) => s + b.amount, 0));
  let left = Math.max(0, income);
  const covered: Bill[] = [];
  let next: { bill: Bill; have: number; missing: number } | null = null;
  for (const b of valid) {
    if (left + 1e-9 >= b.amount) { covered.push(b); left -= b.amount; continue; }
    next = { bill: b, have: cents(left), missing: cents(b.amount - left) };
    break;
  }
  return { total, covered, next, pct: total > 0 ? Math.min(1, Math.max(0, income) / total) : 0, surplus: next ? 0 : cents(left) };
}

/** Capital que gera `monthlyIncome` por mês com a taxa real anual (perpetuidade). */
export function capitalForIncome(monthlyIncome: number, realAnnual: number): number | null {
  if (!(realAnnual > 0)) return null;
  return cents((monthlyIncome * 12) / realAnnual);
}

/** Meses até o patrimônio chegar a `target`, aportando todo fim de mês (null se > 100 anos). */
export function monthsToTarget(current: number, contribution: number, target: number, realAnnual: number): number | null {
  if (current >= target) return 0;
  const r = monthlyRate(realAnnual);
  let v = current;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r) + contribution;
    if (v >= target) return m;
  }
  return null;
}

/** Aporte mensal necessário para chegar a `target` em `months` meses. */
export function contributionFor(current: number, target: number, months: number, realAnnual: number): number {
  if (months <= 0) return Math.max(0, target - current);
  const r = monthlyRate(realAnnual);
  const growth = Math.pow(1 + r, months);
  const need = target - current * growth;
  if (need <= 0) return 0;
  return cents(r === 0 ? need / months : (need * r) / (growth - 1));
}

/** Para cada conta (na ordem), em quantos meses a renda passiva passa a pagá-la. */
export function billTimeline(bills: Bill[], otherIncome: number, current: number, contribution: number, realAnnual: number) {
  let cum = 0;
  return bills.filter((b) => b.amount > 0).map((b) => {
    cum += b.amount;
    const needIncome = Math.max(0, cum - otherIncome);
    const capital = capitalForIncome(needIncome, realAnnual);
    return { bill: b, capital, months: capital === null ? null : monthsToTarget(current, contribution, capital, realAnnual) };
  });
}

export interface Holding { ticker: string; shares: number; price: number; target: number }
export interface Buy { ticker: string; shares: number; cost: number }

/**
 * Aporte do mês: distribui `cash` em cotas INTEIRAS para aproximar a carteira da divisão-alvo
 * definida pela própria pessoa (sem vender nada). Compra sempre a cota do ativo mais abaixo do alvo.
 */
export function planContribution(holdings: Holding[], cash: number, fixed?: { value: number; target: number }) {
  const hs = holdings.filter((h) => h.price > 0 && h.target > 0);
  const fx = fixed && fixed.target > 0 ? fixed : null;
  const tsum = hs.reduce((s, h) => s + h.target, 0) + (fx?.target ?? 0);
  const value = (h: Holding, extra: number) => (h.shares + extra) * h.price;
  const total = holdings.reduce((s, h) => s + h.shares * Math.max(0, h.price), 0) + (fixed?.value ?? 0) + cash;
  const bought = new Map<string, number>(hs.map((h) => [h.ticker, 0]));
  let left = cash;
  // renda fixa (comprada em reais, não em cotas): recebe a parte do dinheiro proporcional ao quanto está abaixo do alvo
  let fixedBuy = 0;
  if (fx && tsum > 0) {
    const gap = (h: Holding) => Math.max(0, (h.target / tsum) * total - h.shares * h.price);
    const fxGap = Math.max(0, (fx.target / tsum) * total - fx.value);
    const allGaps = hs.reduce((s, h) => s + gap(h), 0) + fxGap;
    fixedBuy = allGaps > 0 ? cents(Math.min(fxGap, cash * (fxGap / allGaps))) : 0;
    left -= fixedBuy;
  }
  for (let guard = 0; guard < 100000 && tsum > 0; guard++) {
    let best: Holding | null = null, bestGap = 0;
    for (const h of hs) {
      if (h.price > left + 1e-9) continue;
      const gap = (h.target / tsum) * total - value(h, bought.get(h.ticker)!);
      // só compra se ainda faltar pelo menos meia cota para o alvo (evita passar muito do alvo)
      if (gap >= h.price / 2 && gap / h.price > bestGap) { best = h; bestGap = gap / h.price; }
    }
    if (!best) break;
    bought.set(best.ticker, bought.get(best.ticker)! + 1);
    left -= best.price;
  }
  const buys: Buy[] = hs.map((h) => ({ ticker: h.ticker, shares: bought.get(h.ticker)!, cost: cents(bought.get(h.ticker)! * h.price) })).filter((b) => b.shares > 0);
  const after = holdings.map((h) => ({ ticker: h.ticker, weight: total > 0 ? ((h.shares + (bought.get(h.ticker) ?? 0)) * Math.max(0, h.price)) / total : 0, target: tsum > 0 ? h.target / tsum : 0 }));
  return { buys, fixedBuy, spent: cents(cash - left), leftover: cents(left), after, fixedAfter: fx && total > 0 ? (fx.value + fixedBuy) / total : 0 };
}

/** Como `monthsToTarget`, mas com fração do último mês (para falar em dias). Aceita patrimônio negativo. */
export function monthsToTargetFrac(current: number, contribution: number, target: number, realAnnual: number): number | null {
  if (current >= target) return 0;
  const r = monthlyRate(realAnnual);
  let v = current;
  for (let m = 1; m <= 1200; m++) {
    const next = v * (1 + r) + contribution;
    if (next >= target) return m - 1 + (target - v) / (next - v);
    v = next;
  }
  return null;
}

export const DAYS_PER_MONTH = 365.25 / 12;

/**
 * Quanto um gasto ATRASA (ou um aporte extra ADIANTA, com valor negativo) a liberdade total, em dias.
 * `oneOff`: valor único (gasto > 0; aporte extra < 0). `monthly`: gasto recorrente que sai do aporte mensal.
 * null quando não há plano (meta, aporte) suficiente para calcular.
 */
export function freedomDelayDays(p: { capital: number; contribution: number; target: number; rate: number }, cost: { oneOff?: number; monthly?: number }): number | null {
  if (!(p.target > 0) || p.capital >= p.target) return null;
  const base = monthsToTargetFrac(p.capital, p.contribution, p.target, p.rate);
  const after = monthsToTargetFrac(p.capital - (cost.oneOff ?? 0), p.contribution - (cost.monthly ?? 0), p.target, p.rate);
  if (base === null) return null;
  if (after === null) return Infinity;
  return Math.round((after - base) * DAYS_PER_MONTH);
}

/** Texto curto para dias: "47 dias", "1 ano e 2 meses". */
export function daysLabel(days: number): string {
  const d = Math.abs(days);
  if (!Number.isFinite(d)) return 'mais de 100 anos';
  if (d < 60) return `${d} dia${d === 1 ? '' : 's'}`;
  const months = Math.round(d / DAYS_PER_MONTH);
  const y = Math.floor(months / 12), m = months % 12;
  if (!y) return `${m} meses`;
  return `${y} ano${y > 1 ? 's' : ''}${m ? ` e ${m} ${m > 1 ? 'meses' : 'mês'}` : ''}`;
}

/** % ideal de cada ativo a partir do % de cada classe, dividido igualmente entre os ativos da classe. */
export function idealByClass<C extends string>(assets: { ticker: string; cls: C }[], classPct: Partial<Record<C, number>>): Record<string, number> {
  const count = new Map<C, number>();
  for (const a of assets) count.set(a.cls, (count.get(a.cls) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const a of assets) out[a.ticker] = (classPct[a.cls] ?? 0) / 100 / count.get(a.cls)!;
  return out;
}
