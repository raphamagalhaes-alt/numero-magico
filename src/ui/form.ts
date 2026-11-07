import { dec, validateInput, type SimulationInput } from '../engine';
import { inputForTab, type BaseParams } from '../scenarios/defaults';
import { fmtDecimal } from './format';

/** Estado do formulário em texto pt-BR (o que o usuário digita). */
export interface FormState {
  price: string;
  dividend: string;
  desiredShares: string;
  inflationPct: string;
  contribution: string;
  incomeGoal: string;
  incomeGoalBasis: 'nominal' | 'real';
}
export type FormField = Exclude<keyof FormState, 'incomeGoalBasis'>;

/** "1.582,42" → "1582.42"; "8,89" → "8.89"; "8.89" → "8.89". Retorna null se inválido. */
export function parseBR(raw: string): string | null {
  let s = raw.trim().replace(/^R\$\s*/i, '').replace(/\s|%/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

export function toBR(engineValue: string, minPlaces = 2): string {
  const d = dec(engineValue);
  return fmtDecimal(d, Math.max(minPlaces, d.decimalPlaces()));
}

export function formFromParams(p: BaseParams): FormState {
  return {
    price: toBR(p.price),
    dividend: toBR(p.dividend),
    desiredShares: String(p.desiredShares),
    inflationPct: toBR(dec(p.inflationAnnual).mul(100).toFixed(), 0),
    contribution: toBR(p.monthlyContribution),
    incomeGoal: toBR(p.incomeGoal),
    incomeGoalBasis: p.incomeGoalBasis,
  };
}

const FIELD_OF: Partial<Record<keyof SimulationInput, FormField>> = {
  price: 'price', dividend: 'dividend', desiredShares: 'desiredShares', inflationAnnual: 'inflationPct',
  monthlyContribution: 'contribution', incomeGoal: 'incomeGoal',
};

export function paramsFromForm(f: FormState, ticker: string): { params: BaseParams | null; errors: Partial<Record<FormField, string>> } {
  const errors: Partial<Record<FormField, string>> = {};
  const num = (k: FormField) => {
    const v = parseBR(f[k]);
    if (v === null) errors[k] = 'Número inválido.';
    return v ?? '0';
  };
  const price = num('price');
  const dividend = num('dividend');
  const ds = num('desiredShares');
  const infl = num('inflationPct');
  const contribution = num('contribution');
  const goal = num('incomeGoal');
  const desiredShares = Number(ds);
  const params: BaseParams = {
    ticker, price, dividend, desiredShares,
    inflationAnnual: dec(infl).div(100).toFixed(),
    monthlyContribution: contribution, incomeGoal: goal, incomeGoalBasis: f.incomeGoalBasis,
  };
  for (const issue of validateInput(inputForTab(params, 'aportes'))) {
    const k = FIELD_OF[issue.field];
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { params: Object.keys(errors).length ? null : params, errors };
}
