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

  // ---- Premissas de mercado e tributação (opcionais; padrão = neutro) ----
  /** Mês do 1º pagamento (AAAA-MM). Habilita datas reais de data-com e pagamento. */
  startMonth?: string | null;
  /** Dias úteis entre a data-com (último dia útil do mês anterior) e o pagamento. */
  paymentLagBusinessDays?: number;
  /** Custo percentual sobre o valor de cada compra/venda (corretagem + emolumentos B3), fração. */
  tradingCostPct?: Numeric;
  /** Custo fixo por ordem executada (R$). */
  tradingCostFixed?: Numeric;
  /** Alíquota de IR retida sobre rendimentos (0 = isento), fração. */
  dividendTaxRate?: Numeric;
  /** Alíquota de IR sobre ganho de capital na venda (FII: 20% para pessoa física), fração. */
  capitalGainsTaxRate?: Numeric;
  /** Remuneração anual do saldo residual em caixa, fração. */
  cashYieldAnnual?: Numeric;
}

export interface MagicNumberResult {
  finite: boolean;
  /** Menor quantidade inteira de cotas cujo rendimento (em centavos) paga a compra desejada. */
  shares: number;
  /** teto[(cotas desejadas × preço) / dividendo], sem quantização. */
  theoreticalShares: number;
  /** true quando a quantização em centavos alterou o resultado teórico. */
  quantizationAdjusted: boolean;
  /** Custo da compra desejada (cotas desejadas × preço + custos de negociação). */
  targetCost: Dec;
  /** Custos de negociação da compra inicial. */
  initialFees: Dec;
  initialInvestment: Dec;
  firstIncome: Dec;
}

export interface MonthRow {
  month: number;
  /** Data-com (AAAA-MM-DD) e pagamento/compra, quando startMonth é informado. */
  recordDate: string | null;
  paymentDate: string | null;
  year: number;
  monthOfYear: number;
  sharesStart: number;
  price: Dec;
  dividendPerShare: Dec;
  /** Rendimento bruto recebido (cotas iniciais × dividendo, em centavos). */
  income: Dec;
  /** IR retido sobre o rendimento. */
  dividendTax: Dec;
  /** Rendimento líquido de IR. */
  netIncome: Dec;
  /** Remuneração do saldo residual anterior. */
  cashInterest: Dec;
  reinvested: Dec;
  withdrawn: Dec;
  contribution: Dec;
  cashCarry: Dec;
  available: Dec;
  sharesBought: number;
  /** Custo total das compras do mês, incluindo custos de negociação. */
  purchaseCost: Dec;
  purchaseFees: Dec;
  cashEnd: Dec;
  sharesEnd: number;
  sharesValue: Dec;
  totalEquity: Dec;
  /** Custo de aquisição acumulado das cotas (base para ganho de capital). */
  costBasis: Dec;
  /** IR + custos que incidiriam se todas as cotas fossem vendidas ao preço do mês. */
  liquidationCosts: Dec;
  /** Patrimônio líquido de custos de venda e IR sobre ganho de capital. */
  netLiquidationEquity: Dec;
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
  totalFees: Dec;
  totalDividendTax: Dec;
  totalCashInterest: Dec;
  finalLiquidationCosts: Dec;
  finalNetLiquidationEquity: Dec;
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
