/** Metas dos filhos: a mesada que vira investimento, em reais de hoje (taxa acima da inflação). */
import { contributionFor, monthlyRate, monthsToTarget } from './freedom';

export interface KidGoal { name: string; birth: string; goal: string; target: number; atAge: number; monthly: number; have: number }

const monthsBetween = (fromISO: string, toISO: string) => {
  const [a, b] = fromISO.split('-').map(Number), [c, d] = toISO.split('-').map(Number);
  return (c - a) * 12 + (d - b);
};
export const ageYears = (birth: string, today: string) => Math.floor(monthsBetween(birth, today) / 12 - (Number(today.slice(8, 10)) < Number(birth.slice(8, 10)) && today.slice(5, 7) === birth.slice(5, 7) ? 1 / 12 : 0));

/** Valor futuro (em reais de hoje) depois de `months` meses aportando `monthly` no fim de cada mês. */
export function futureValue(have: number, monthly: number, months: number, realAnnual: number) {
  const r = monthlyRate(realAnnual);
  let v = have;
  for (let m = 0; m < months; m++) v = v * (1 + r) + monthly;
  return Math.round(v * 100) / 100;
}

export function kidPlan(k: KidGoal, today: string, realAnnual: number) {
  const ageNow = ageYears(k.birth, today);
  const monthsLeft = Math.max(0, (k.atAge * 12) - monthsBetween(k.birth, today));
  const projected = futureValue(k.have, k.monthly, monthsLeft, realAnnual);
  const reachMonths = monthsToTarget(k.have, k.monthly, k.target, realAnnual);
  const reachAge = reachMonths === null ? null : Math.floor((monthsBetween(k.birth, today) + reachMonths) / 12);
  const needed = contributionFor(k.have, k.target, monthsLeft, realAnnual);
  // valor em cada aniversário até a idade da meta (para mostrar para a criança)
  const birthdays: { age: number; value: number }[] = [];
  const passed = monthsBetween(k.birth, today);
  for (let age = ageNow + 1; age <= k.atAge; age++) birthdays.push({ age, value: futureValue(k.have, k.monthly, age * 12 - passed, realAnnual) });
  return { ageNow, monthsLeft, projected, pct: k.target > 0 ? Math.min(1, projected / k.target) : 0, reachMonths, reachAge, needed, birthdays, onTrack: projected >= k.target };
}
