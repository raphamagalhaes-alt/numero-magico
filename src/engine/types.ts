import type { Dec, Numeric } from './decimal';

/** Parâmetros de uma simulação. Percentuais são frações decimais (6% = 0.06). */
export interface SimulationInput {
  /** Preço inicial da cota (R$). */
  price: Numeric;
  /** Dividendo mensal por cota (R$), pode ter 3+ casas decimais. */
  dividend: Numeric;
  /** Cotas que se deseja comprar por mês apenas com dividendos (número mágico). */
  desiredShares: number;
  /** Número de períodos mensais. Padrão do produto: 360. */
  months: number;
  /** Substitui as cotas iniciais calculadas pelo número mágico (opcional). */
  initialSharesOverride?: number | null;
  /** Aporte mensal base (R$). */
  monthlyContribution: Numeric;
  /** Primeiro mês com aporte (padrão 2). */
  contributionStartMonth: number;
  /** Reajusta o aporte uma vez por ano pela inflação. */
  contributionAdjustAnnual: boolean;
  /** Inflação anual (fração). Deve ser > -1. */
  inflationAnnual: Numeric;
  /** Variação anual do preço da cota (fração), aplicada a cada 12 meses. */
  priceAnnualChange: Numeric;
  /** Variação anual do dividendo (fração), aplicada a cada 12 meses. */
  dividendAnnualChange: Numeric;
  /** Ajuste único no dividendo desde o mês 1 (ex.: -0.1 = corte de 10%). */
  dividendInitialChange: Numeric;
  /** Fração do rendimento reinvestida: 1, 0.5, 0. */
  reinvestRatio: Numeric;
  /** Meta de renda mensal (R$). */
  incomeGoal: Numeric;
  /** Meta comparada à renda nominal ou à renda real (poder de compra do mês 0). */
  incomeGoalBasis: 'nominal' | 'real';
}

export interface MagicNumberResult {
  finite: boolean;
  /** Menor quantidade inteira de cotas cujo rendimento (em centavos) paga a compra desejada. */
  shares: number;
  /** teto[(cotas desejadas × preço) / dividendo], sem quantização. */
  theoreticalShares: number;
  /** true quando a quantização em centavos alterou o resultado teórico. */
  quantizationAdjusted: boolean;
  /** Custo da compra desejada (cotas desejadas × preço). */
  targetCost: Dec;
  initialInvestment: Dec;
  firstIncome: Dec;
}

export interface MonthRow {
  month: number;
  year: number;
  monthOfYear: number;
  sharesStart: number;
  price: Dec;
  dividendPerShare: Dec;
  /** Rendimento recebido (cotas iniciais × dividendo, em centavos). */
  income: Dec;
  reinvested: Dec;
  withdrawn: Dec;
  contribution: Dec;
  cashCarry: Dec;
  available: Dec;
  sharesBought: number;
  purchaseCost: Dec;
  cashEnd: Dec;
  sharesEnd: number;
  sharesValue: Dec;
  totalEquity: Dec;
  cumContributions: Dec;
  cumIncome: Dec;
  cumReinvested: Dec;
  cumWithdrawn: Dec;
  /** (1 + inflação)^(t/12). */
  deflator: Dec;
  realIncome: Dec;
  realEquity: Dec;
  /** Renda corrente comparada à meta (nominal ou real conforme a base). */
  goalIncome: Dec;
  /** Recorde estrito de cotas compradas em um mês. */
  isPurchaseRecord: boolean;
  isGoalMonth: boolean;
}

export interface SimulationSummary {
  initialShares: number;
  initialInvestment: Dec;
  finalShares: number;
  finalIncome: Dec;
  finalRealIncome: Dec;
  finalEquity: Dec;
  finalRealEquity: Dec;
  finalSharesValue: Dec;
  finalCash: Dec;
  totalContributions: Dec;
  totalInvested: Dec;
  totalIncome: Dec;
  totalReinvested: Dec;
  totalWithdrawn: Dec;
  /** Patrimônio final − (investimento inicial + aportes). */
  growthOverInvested: Dec;
  /** Patrimônio final / capital aportado − 1. */
  growthPct: Dec;
  /** Perda de poder de compra do patrimônio final (nominal − real). */
  purchasingPowerLoss: Dec;
  goalMonth: number | null;
  goalProgress: Dec;
}

export interface SimulationResult {
  input: SimulationInput;
  magic: MagicNumberResult;
  rows: MonthRow[];
  summary: SimulationSummary;
}

export interface ValidationIssue {
  field: keyof SimulationInput;
  message: string;
}
