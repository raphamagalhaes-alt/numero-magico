import { dec } from './decimal';
import type { SimulationInput, ValidationIssue } from './types';

function isFiniteNumeric(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  try {
    const d = dec(v as string);
    return d.isFinite();
  } catch {
    return false;
  }
}

/** Valida parâmetros; retorna lista vazia quando a simulação pode ser executada. */
export function validateInput(input: SimulationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: keyof SimulationInput, message: string) => issues.push({ field, message });

  const numericFields: (keyof SimulationInput)[] = [
    'price', 'dividend', 'monthlyContribution', 'inflationAnnual', 'priceAnnualChange',
    'dividendAnnualChange', 'dividendInitialChange', 'reinvestRatio', 'incomeGoal',
  ];
  for (const f of numericFields) {
    if (!isFiniteNumeric(input[f])) add(f, 'Informe um número válido e finito.');
  }
  if (issues.length) return issues;

  if (dec(input.price).lte(0)) add('price', 'O preço da cota deve ser maior que zero.');
  if (dec(input.dividend).lt(0)) add('dividend', 'O dividendo não pode ser negativo.');
  if (dec(input.monthlyContribution).lt(0)) add('monthlyContribution', 'O aporte não pode ser negativo.');
  if (dec(input.inflationAnnual).lte(-1)) add('inflationAnnual', 'A inflação deve ser maior que −100%.');
  if (dec(input.priceAnnualChange).lte(-1)) add('priceAnnualChange', 'A variação do preço deve ser maior que −100%.');
  if (dec(input.dividendAnnualChange).lte(-1)) add('dividendAnnualChange', 'A variação do dividendo deve ser maior que −100%.');
  if (dec(input.dividendInitialChange).lt(-1)) add('dividendInitialChange', 'O ajuste do dividendo não pode ser menor que −100%.');
  const r = dec(input.reinvestRatio);
  if (r.lt(0) || r.gt(1)) add('reinvestRatio', 'O reinvestimento deve estar entre 0% e 100%.');
  if (dec(input.incomeGoal).lt(0)) add('incomeGoal', 'A meta de renda não pode ser negativa.');

  if (!Number.isInteger(input.desiredShares) || input.desiredShares <= 0)
    add('desiredShares', 'A quantidade desejada de cotas deve ser um inteiro positivo.');
  if (!Number.isInteger(input.months) || input.months <= 0 || input.months > 1200)
    add('months', 'O prazo deve ser um inteiro entre 1 e 1200 meses.');
  if (!Number.isInteger(input.contributionStartMonth) || input.contributionStartMonth < 1)
    add('contributionStartMonth', 'O mês do primeiro aporte deve ser um inteiro ≥ 1.');
  const o = input.initialSharesOverride;
  if (o !== undefined && o !== null && (!Number.isInteger(o) || o < 0))
    add('initialSharesOverride', 'As cotas iniciais devem ser um inteiro não negativo.');
  if (input.incomeGoalBasis !== 'nominal' && input.incomeGoalBasis !== 'real')
    add('incomeGoalBasis', 'Base da meta inválida.');
  return issues;
}

export class InvalidSimulationInput extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Parâmetros inválidos: ${issues.map((i) => `${String(i.field)}: ${i.message}`).join('; ')}`);
    this.name = 'InvalidSimulationInput';
  }
}
