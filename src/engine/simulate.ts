import { D, ONE, ZERO, dec, toCents, truncate, type Dec } from './decimal';
import { magicNumber } from './magic';
import { addBusinessDays, addMonths, lastBusinessDayOfMonth } from './calendar';
import { affordableShares, costModel, orderFees, orderTotal } from './costs';
import type { MonthRow, SimulationInput, SimulationResult, SimulationSummary } from './types';
import { InvalidSimulationInput, validateInput } from './validation';

const DIVIDEND_PLACES = 6;
export const DEFAULT_PAYMENT_LAG = 10;

export function yearIndex(month: number): number {
  return Math.floor((month - 1) / 12);
}

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

export function contributionAt(input: SimulationInput, month: number): Dec {
  const base = dec(input.monthlyContribution);
  if (month < input.contributionStartMonth || base.isZero()) return ZERO;
  if (!input.contributionAdjustAnnual) return toCents(base);
  return toCents(base.mul(ONE.add(dec(input.inflationAnnual)).pow(yearIndex(month))));
}

export function deflatorAt(inflationAnnual: Dec, month: number): Dec {
  if (inflationAnnual.isZero()) return ONE;
  return ONE.add(inflationAnnual).pow(new D(month).div(12));
}

/**
 * Datas do mês t: o rendimento pago no mês t refere-se às cotas detidas na data-com
 * (último dia útil do mês anterior) e é pago N dias úteis depois. As cotas compradas
 * no pagamento estão em carteira na data-com seguinte — por isso só rendem no mês t+1.
 */
export function datesAt(startMonth: string, month: number, lag: number): { recordDate: string; paymentDate: string } {
  const payMonth = addMonths(startMonth, month - 1);
  const recordDate = lastBusinessDayOfMonth(addMonths(payMonth, -1));
  return { recordDate, paymentDate: addBusinessDays(recordDate, lag) };
}

export function simulate(input: SimulationInput): SimulationResult {
  const issues = validateInput(input);
  if (issues.length) throw new InvalidSimulationInput(issues);

  const costs = costModel(input.tradingCostPct ?? 0, input.tradingCostFixed ?? 0);
  const taxRate = dec(input.dividendTaxRate ?? 0);
  const cgRate = dec(input.capitalGainsTaxRate ?? 0);
  const cashMonthly = dec(input.cashYieldAnnual ?? 0).isZero() ? ZERO : ONE.add(dec(input.cashYieldAnnual!)).pow(new D(1).div(12)).sub(1);
  const lag = input.paymentLagBusinessDays ?? DEFAULT_PAYMENT_LAG;

  const magic = magicNumber(input.price, input.dividend, input.desiredShares, input);
  const initialShares = input.initialSharesOverride ?? magic.shares;
  const p0 = dec(input.price);
  const initialFees = orderFees(initialShares, p0, costs);
  const initialInvestment = p0.mul(initialShares).add(initialFees);
  const inflation = dec(input.inflationAnnual);
  const reinvestRatio = dec(input.reinvestRatio);
  const goal = dec(input.incomeGoal);

  const rows: MonthRow[] = [];
  let shares = initialShares;
  let cash = ZERO;
  let costBasis = initialInvestment;
  let cumContributions = ZERO, cumIncome = ZERO, cumReinvested = ZERO, cumWithdrawn = ZERO;
  let cumFees = initialFees, cumTax = ZERO, cumInterest = ZERO;
  let maxBought = 0;
  let goalMonth: number | null = null;

  for (let t = 1; t <= input.months; t++) {
    const dates = input.startMonth ? datesAt(input.startMonth, t, lag) : { recordDate: null, paymentDate: null };
    // 1. cotas no início do mês (detidas na data-com)
    const sharesStart = shares;
    const price = priceAt(input, t);
    const dps = dividendAt(input, t);
    // 2–3. rendimento bruto em centavos (half-up); IR retido, se houver
    const income = toCents(dps.mul(sharesStart));
    const dividendTax = taxRate.isZero() ? ZERO : toCents(income.mul(taxRate));
    const netIncome = income.sub(dividendTax);
    const reinvested = reinvestRatio.eq(1) ? netIncome : toCents(netIncome.mul(reinvestRatio));
    const withdrawn = netIncome.sub(reinvested);
    const contribution = contributionAt(input, t);
    // remuneração da sobra anterior (truncada em centavos: nunca cria dinheiro)
    const cashCarry = cash;
    const cashInterest = cashMonthly.isZero() ? ZERO : truncate(cashCarry.mul(cashMonthly), 2);
    // 4. disponível
    const available = reinvested.add(contribution).add(cashCarry).add(cashInterest);
    // 5–7. compra de cotas inteiras, com custos de negociação
    const sharesBought = affordableShares(available, price, costs);
    const purchaseFees = orderFees(sharesBought, price, costs);
    const purchaseCost = orderTotal(sharesBought, price, costs);
    const cashEnd = available.sub(purchaseCost);
    if (cashEnd.lt(0)) throw new Error(`Saldo negativo no mês ${t}`);
    // 8–10.
    const sharesEnd = sharesStart + sharesBought;
    const sharesValue = price.mul(sharesEnd);
    const totalEquity = sharesValue.add(cashEnd);
    costBasis = costBasis.add(purchaseCost);
    // valor líquido em caso de venda total: custos de venda + IR sobre ganho de capital
    const saleFees = orderFees(sharesEnd, price, costs);
    const gain = sharesValue.sub(saleFees).sub(costBasis);
    const cgTax = gain.gt(0) ? toCents(gain.mul(cgRate)) : ZERO;
    const liquidationCosts = saleFees.add(cgTax);
    const netLiquidationEquity = totalEquity.sub(liquidationCosts);
    // 11.
    cumContributions = cumContributions.add(contribution);
    cumIncome = cumIncome.add(income);
    cumReinvested = cumReinvested.add(reinvested);
    cumWithdrawn = cumWithdrawn.add(withdrawn);
    cumFees = cumFees.add(purchaseFees);
    cumTax = cumTax.add(dividendTax);
    cumInterest = cumInterest.add(cashInterest);
    const deflator = deflatorAt(inflation, t);
    const realIncome = netIncome.div(deflator);
    const realEquity = totalEquity.div(deflator);
    const goalIncome = input.incomeGoalBasis === 'real' ? realIncome : netIncome;
    const isGoalMonth = goalMonth === null && goal.gt(0) && goalIncome.gte(goal);
    if (isGoalMonth) goalMonth = t;
    const isPurchaseRecord = sharesBought > maxBought;
    if (isPurchaseRecord) maxBought = sharesBought;

    rows.push({
      month: t, ...dates, year: yearIndex(t) + 1, monthOfYear: ((t - 1) % 12) + 1,
      sharesStart, price, dividendPerShare: dps, income, dividendTax, netIncome, cashInterest,
      reinvested, withdrawn, contribution, cashCarry, available, sharesBought, purchaseCost, purchaseFees,
      cashEnd, sharesEnd, sharesValue, totalEquity, costBasis, liquidationCosts, netLiquidationEquity,
      cumContributions, cumIncome, cumReinvested, cumWithdrawn,
      deflator, realIncome, realEquity, goalIncome, isPurchaseRecord, isGoalMonth,
    });
    shares = sharesEnd;
    cash = cashEnd;
  }

  const last = rows[rows.length - 1];
  const totalInvested = initialInvestment.add(cumContributions);
  const summary: SimulationSummary = {
    initialShares,
    initialInvestment,
    finalShares: last.sharesEnd,
    finalIncome: last.netIncome,
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
    totalFees: cumFees,
    totalDividendTax: cumTax,
    totalCashInterest: cumInterest,
    finalLiquidationCosts: last.liquidationCosts,
    finalNetLiquidationEquity: last.netLiquidationEquity,
    growthOverInvested: last.totalEquity.sub(totalInvested),
    growthPct: totalInvested.isZero() ? ZERO : last.totalEquity.div(totalInvested).sub(1),
    purchasingPowerLoss: last.totalEquity.sub(last.realEquity),
    goalMonth,
    goalProgress: goal.isZero() ? ONE : D.min(ONE, last.goalIncome.div(goal)),
  };

  return { input, magic, rows, summary };
}

export function monthsToYearsMonths(month: number): { years: number; months: number } {
  return { years: Math.floor(month / 12), months: month % 12 };
}
