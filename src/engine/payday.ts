/**
 * Dia do salário — "pague-se primeiro" (Thaler & Benartzi, Save More Tomorrow): a decisão de quanto
 * guardar é tomada ANTES de o dinheiro chegar, e o percentual sobe sozinho com o tempo/aumentos.
 */
import { isTradingDay } from './calendar';

export type PayRule = { kind: 'dia'; day: number } | { kind: 'util'; n: number };
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const businessDay = (d: string) => isTradingDay(d); // dias úteis nacionais (calendário de feriados do app)

/** Data do pagamento no mês: dia fixo (se cair em dia não útil, antecipa) ou N-ésimo dia útil. */
export function payDate(ym: string, rule: PayRule): string {
  if (rule.kind === 'dia') {
    let day = Math.min(Math.max(1, Math.round(rule.day)), lastDay(ym));
    while (day > 1 && !businessDay(`${ym}-${pad(day)}`)) day--;
    return `${ym}-${pad(day)}`;
  }
  let count = 0;
  for (let day = 1; day <= lastDay(ym); day++) {
    const d = `${ym}-${pad(day)}`;
    if (businessDay(d) && ++count === Math.max(1, Math.round(rule.n))) return d;
  }
  return `${ym}-${pad(lastDay(ym))}`;
}

export interface AutoRaise { on: boolean; step: number; everyMonths: number; max: number; start: string }
const monthsBetween = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };

/** Percentual a guardar hoje, já com os aumentos automáticos combinados (nunca acima do teto). */
export function effectivePct(base: number, raise: AutoRaise | null, today: string): { pct: number; nextAt: string | null } {
  if (!raise?.on || raise.step <= 0 || raise.everyMonths <= 0) return { pct: base, nextAt: null };
  const steps = Math.max(0, Math.floor(monthsBetween(raise.start.slice(0, 7), today.slice(0, 7)) / raise.everyMonths));
  const pct = Math.min(Math.max(base, raise.max), base + steps * raise.step);
  if (pct >= raise.max) return { pct: Math.min(pct, Math.max(base, raise.max)), nextAt: null };
  const [y, m] = raise.start.slice(0, 7).split('-').map(Number);
  const n = (steps + 1) * raise.everyMonths;
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return { pct, nextAt: d.toISOString().slice(0, 7) };
}

/** Divide o que vai ser guardado: reserva de emergência primeiro (até a meta), o resto para investir. */
export function splitPayday(o: { salary: number; pct: number; reserveHave: number; reserveTarget: number; reserveShare: number }) {
  const cents = (v: number) => Math.round(v * 100) / 100;
  const save = cents(Math.max(0, o.salary) * Math.max(0, o.pct) / 100);
  const gap = Math.max(0, o.reserveTarget - o.reserveHave);
  const toReserve = cents(Math.min(gap, save * Math.min(1, Math.max(0, o.reserveShare))));
  return { save, toReserve, toInvest: cents(save - toReserve), reserveDone: gap === 0 };
}

/** Meses seguidos em que o plano foi cumprido (o mês atual só conta se já foi feito). */
export function streak(doneMonths: string[], currentYm: string): number {
  const set = new Set(doneMonths);
  let ym = set.has(currentYm) ? currentYm : prev(currentYm);
  let n = 0;
  while (set.has(ym)) { n++; ym = prev(ym); }
  return n;
}
function prev(ym: string) { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); }
