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
  startMonth: string;
  paymentLag: string;
  costPct: string;
  costFixed: string;
  dividendTaxPct: string;
  cgTaxPct: string;
  cashYieldPct: string;
  maxCostPct: string;
}
export type FormField = Exclude<keyof FormState, 'incomeGoalBasis'>;

/** "1.582,42" → "1582.42"; "8,89" → "8.89"; "8.89" → "8.89". Retorna null se inválido. */
export function parseBR(raw: string): string | null {
  let s = raw.trim().replace(/^R\$\s*/i, '').replace(/\s|%/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 2.000 = dois mil (separador de milhar)
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

export function toBR(engineValue: string, minPlaces = 2): string {
  const d = dec(engineValue);
  return fmtDecimal(d, Math.max(minPlaces, d.decimalPlaces()));
}
const pctBR = (frac: string) => toBR(dec(frac).mul(100).toFixed(), 0);

export function formFromParams(p: BaseParams): FormState {
  return {
    price: toBR(p.price),
    dividend: toBR(p.dividend),
    desiredShares: String(p.desiredShares),
    inflationPct: pctBR(p.inflationAnnual),
    contribution: toBR(p.monthlyContribution),
    incomeGoal: toBR(p.incomeGoal),
    incomeGoalBasis: p.incomeGoalBasis,
    startMonth: p.startMonth,
    paymentLag: String(p.paymentLagBusinessDays),
    costPct: pctBR(p.tradingCostPct),
    costFixed: toBR(p.tradingCostFixed),
    dividendTaxPct: pctBR(p.dividendTaxRate),
    cgTaxPct: pctBR(p.capitalGainsTaxRate),
    cashYieldPct: pctBR(p.cashYieldAnnual),
    maxCostPct: pctBR(p.maxCostPct ?? '0'),
  };
}

const FIELD_OF: Partial<Record<keyof SimulationInput, FormField>> = {
  price: 'price', dividend: 'dividend', desiredShares: 'desiredShares', inflationAnnual: 'inflationPct',
  monthlyContribution: 'contribution', incomeGoal: 'incomeGoal', startMonth: 'startMonth',
  paymentLagBusinessDays: 'paymentLag', tradingCostPct: 'costPct', tradingCostFixed: 'costFixed',
  dividendTaxRate: 'dividendTaxPct', capitalGainsTaxRate: 'cgTaxPct', cashYieldAnnual: 'cashYieldPct', maxCostPct: 'maxCostPct',
};

export function paramsFromForm(f: FormState, ticker: string): { params: BaseParams | null; errors: Partial<Record<FormField, string>> } {
  const errors: Partial<Record<FormField, string>> = {};
  const num = (k: FormField) => {
    const v = parseBR(f[k] ?? '');
    if (v === null) errors[k] = 'Número inválido.';
    return v ?? '0';
  };
  const frac = (k: FormField) => dec(num(k)).div(100).toFixed();
  const lag = num('paymentLag');
  const params: BaseParams = {
    ticker,
    price: num('price'),
    dividend: num('dividend'),
    desiredShares: Number(num('desiredShares')),
    inflationAnnual: frac('inflationPct'),
    monthlyContribution: num('contribution'),
    incomeGoal: num('incomeGoal'),
    incomeGoalBasis: f.incomeGoalBasis,
    startMonth: f.startMonth ?? '',
    paymentLagBusinessDays: Number(lag),
    tradingCostPct: frac('costPct'),
    tradingCostFixed: num('costFixed'),
    dividendTaxRate: frac('dividendTaxPct'),
    capitalGainsTaxRate: frac('cgTaxPct'),
    cashYieldAnnual: frac('cashYieldPct'),
    maxCostPct: f.maxCostPct === undefined || f.maxCostPct === '' ? '0' : frac('maxCostPct'),
  };
  for (const issue of validateInput(inputForTab(params, 'aportes'))) {
    const k = FIELD_OF[issue.field];
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { params: Object.keys(errors).length ? null : params, errors };
}
