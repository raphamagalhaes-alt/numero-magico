import { D, ONE, ZERO, dec, toCents, truncate, type Dec } from './decimal';
import { magicNumber } from './magic';
import type { MonthRow, SimulationInput, SimulationResult, SimulationSummary } from './types';
import { InvalidSimulationInput, validateInput } from './validation';

const DIVIDEND_PLACES = 6;

/** Índice do ano de simulação (0 para meses 1–12, 1 para 13–24, ...). */
export function yearIndex(month: number): number {
  return Math.floor((month - 1) / 12);
}

/** Preço no mês t: preço inicial × (1 + g)^anoIndex, em centavos quando há variação. */
export function priceAt(input: SimulationInput, month: number): Dec {
  const p0 = dec(input.price);
  const g = dec(input.priceAnnualChange);
  if (g.isZero()) return p0;
  return toCents(p0.mul(ONE.add(g).pow(yearIndex(month))));
}

/** Dividendo por cota no mês t. Valores derivados são truncados (nunca arredondados para cima). */
export function dividendAt(input: SimulationInput, month: number): Dec {
  const d0 = dec(input.dividend);
  const cut = dec(input.dividendInitialChange);
  const g = dec(input.dividendAnnualChange);
  if (cut.isZero() && g.isZero()) return d0;
  return truncate(d0.mul(ONE.add(cut)).mul(ONE.add(g).pow(yearIndex(month))), DIVIDEND_PLACES);
}

/** Aporte do mês t: zero antes do mês inicial; reajustado uma vez por ano pela inflação. */
export function contributionAt(input: SimulationInput, month: number): Dec {
  const base = dec(input.monthlyContribution);
  if (month < input.contributionStartMonth || base.isZero()) return ZERO;
  if (!input.contributionAdjustAnnual) return toCents(base);
  return toCents(base.mul(ONE.add(dec(input.inflationAnnual)).pow(yearIndex(month))));
}

/** Fator de deflação (1 + inflação)^(t/12), com mês 0 como data-base. */
export function deflatorAt(inflationAnnual: Dec, month: number): Dec {
  if (inflationAnnual.isZero()) return ONE;
  return ONE.add(inflationAnnual).pow(new D(month).div(12));
}

export function simulate(input: SimulationInput): SimulationResult {
  const issues = validateInput(input);
  if (issues.length) throw new InvalidSimulationInput(issues);

  const magic = magicNumber(input.price, input.dividend, input.desiredShares);
  const initialShares = input.initialSharesOverride ?? magic.shares;
  const p0 = dec(input.price);
  const initialInvestment = p0.mul(initialShares);
  const inflation = dec(input.inflationAnnual);
  const reinvestRatio = dec(input.reinvestRatio);
  const goal = dec(input.incomeGoal);

  const rows: MonthRow[] = [];
  let shares = initialShares;
  let cash = ZERO;
  let cumContributions = ZERO;
  let cumIncome = ZERO;
  let cumReinvested = ZERO;
  let cumWithdrawn = ZERO;
  let maxBought = 0;
  let goalMonth: number | null = null;

  for (let t = 1; t <= input.months; t++) {
    // 1. cotas no início do mês
    const sharesStart = shares;
    const price = priceAt(input, t);
    const dps = dividendAt(input, t);
    // 2–3. rendimento das cotas elegíveis, em centavos (half-up)
    const income = toCents(dps.mul(sharesStart));
    const reinvested = reinvestRatio.eq(1) ? income : toCents(income.mul(reinvestRatio));
    const withdrawn = income.sub(reinvested);
    const contribution = contributionAt(input, t);
    // 4. disponível = rendimento reinvestido + aporte + sobra anterior
    const cashCarry = cash;
    const available = reinvested.add(contribution).add(cashCarry);
    // 5. cotas inteiras compráveis
    const sharesBought = available.div(price).toDecimalPlaces(0, D.ROUND_FLOOR).toNumber();
    // 6–7. custo e sobra
    const purchaseCost = price.mul(sharesBought);
    const cashEnd = available.sub(purchaseCost);
    if (cashEnd.lt(0)) throw new Error(`Saldo negativo no mês ${t}`); // invariante
    // 8. cotas no encerramento
    const sharesEnd = sharesStart + sharesBought;
    // 9–10. valor de mercado e patrimônio total
    const sharesValue = price.mul(sharesEnd);
    const totalEquity = sharesValue.add(cashEnd);
    // 11. acumulados e indicadores
    cumContributions = cumContributions.add(contribution);
    cumIncome = cumIncome.add(income);
    cumReinvested = cumReinvested.add(reinvested);
    cumWithdrawn = cumWithdrawn.add(withdrawn);
    const deflator = deflatorAt(inflation, t);
    const realIncome = income.div(deflator);
    const realEquity = totalEquity.div(deflator);
    const goalIncome = input.incomeGoalBasis === 'real' ? realIncome : income;
    const isGoalMonth = goalMonth === null && goal.gt(0) && goalIncome.gte(goal);
    if (isGoalMonth) goalMonth = t;
    const isPurchaseRecord = sharesBought > maxBought;
    if (isPurchaseRecord) maxBought = sharesBought;

    rows.push({
      month: t, year: yearIndex(t) + 1, monthOfYear: ((t - 1) % 12) + 1,
      sharesStart, price, dividendPerShare: dps, income, reinvested, withdrawn, contribution,
      cashCarry, available, sharesBought, purchaseCost, cashEnd, sharesEnd, sharesValue, totalEquity,
      cumContributions, cumIncome, cumReinvested, cumWithdrawn,
      deflator, realIncome, realEquity, goalIncome, isPurchaseRecord, isGoalMonth,
    });
    shares = sharesEnd;
    cash = cashEnd;
  }

  const last = rows[rows.length - 1];
  const totalInvested = initialInvestment.add(cumContributions);
  const lastIncome = last.goalIncome;
  const summary: SimulationSummary = {
    initialShares,
    initialInvestment,
    finalShares: last.sharesEnd,
    finalIncome: last.income,
    finalRealIncome: last.realIncome,
    finalEquity: last.totalEquity,
    finalRealEquity: last.realEquity,
    finalSharesValue: last.sharesValue,
    finalCash: last.cashEnd,
    totalContributions: cumContributions,
    totalInvested,
    totalIncome: cumIncome,
    totalReinvested: cumReinvested,
    totalWithdrawn: cumWithdrawn,
    growthOverInvested: last.totalEquity.sub(totalInvested),
    growthPct: totalInvested.isZero() ? ZERO : last.totalEquity.div(totalInvested).sub(1),
    purchasingPowerLoss: last.totalEquity.sub(last.realEquity),
    goalMonth,
    goalProgress: goal.isZero() ? ONE : D.min(ONE, lastIncome.div(goal)),
  };

  return { input, magic, rows, summary };
}

/** Converte o mês da conquista em "X anos e Y meses". */
export function monthsToYearsMonths(month: number): { years: number; months: number } {
  return { years: Math.floor(month / 12), months: month % 12 };
}
