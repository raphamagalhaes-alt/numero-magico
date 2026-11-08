import type { FormState } from './form';
import type { MainTab } from '../scenarios/defaults';

/** Estado compartilhável na URL (?s=...): só parâmetros da simulação, nenhum dado pessoal. */
export interface SharedState { ticker: string; tab: MainTab; form: FormState }

const KEYS: (keyof FormState)[] = ['price', 'dividend', 'desiredShares', 'inflationPct', 'contribution', 'incomeGoal', 'incomeGoalBasis',
  'startMonth', 'paymentLag', 'costPct', 'costFixed', 'dividendTaxPct', 'cgTaxPct', 'cashYieldPct'];

export function encodeShare(s: SharedState): string {
  const p = new URLSearchParams({ t: s.ticker, a: s.tab });
  for (const k of KEYS) p.set(k, String(s.form[k] ?? ''));
  return p.toString();
}

/** Lê e valida o estado da URL; campos desconhecidos ou de tamanho anormal são ignorados. */
export function decodeShare(search: string, base: FormState): SharedState | null {
  const p = new URLSearchParams(search);
  const t = p.get('t');
  if (!t || !/^[A-Z0-9]{4,8}$/.test(t)) return null;
  const a = p.get('a');
  const tab: MainTab = a === 'inflacao' || a === 'aportes' ? a : 'nominal';
  const form = { ...base };
  for (const k of KEYS) {
    const v = p.get(k);
    if (v === null || v.length > 20) continue;
    if (k === 'incomeGoalBasis') { if (v === 'nominal' || v === 'real') form.incomeGoalBasis = v; continue; }
    (form as Record<string, string>)[k] = v;
  }
  return { ticker: t, tab, form };
}
