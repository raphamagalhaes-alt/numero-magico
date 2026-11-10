import { dec, truncate } from './decimal';

/**
 * Faixas de resultado (Monte Carlo). Cada trajetória sorteia, mês a mês, o retorno do preço
 * (lognormal com volatilidade anual σ) e, ano a ano, a variação do dividendo (normal com σ_d).
 * Usa ponto flutuante de propósito: é uma distribuição estatística, não um extrato. Semente fixa
 * para resultados reprodutíveis. As premissas são hipóteses, não previsões.
 */
export interface MonteCarloInput {
  price: number;
  dividend: number;
  initialShares: number;
  months: number;
  monthlyContribution: number;
  contributionStartMonth: number;
  inflationAnnual: number;
  /** Tendência anual do preço (fração) e volatilidade anual. */
  priceDriftAnnual: number;
  priceVolAnnual: number;
  /** Tendência anual do dividendo e volatilidade anual. */
  dividendDriftAnnual: number;
  dividendVolAnnual: number;
  incomeGoal: number;
  paths: number;
  seed?: number;
  contributionAdjustAnnual?: boolean;
  dividendInitialChange?: number;
  reinvestRatio?: number;
  dividendTaxRate?: number;
  tradingCostPct?: number;
  tradingCostFixed?: number;
  cashYieldAnnual?: number;
  maxCostPct?: number | null;
  incomeGoalBasis?: 'nominal' | 'real';
}

export interface Band { year: number; p10: number; p50: number; p90: number }
export interface MonteCarloResult {
  equity: Band[];
  income: Band[];
  /** Probabilidade de a renda líquida atingir a meta, na base nominal ou real escolhida. */
  goalProbability: number;
  finalEquity: { p10: number; p50: number; p90: number };
}

/** PRNG mulberry32 + Box-Muller. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { let x = 0, y = 0; while (x === 0) x = u(); while (y === 0) y = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y); };
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export function monteCarlo(i: MonteCarloInput): MonteCarloResult {
  if (!Number.isInteger(i.months) || i.months < 1 || !Number.isInteger(i.paths) || i.paths < 1) throw new RangeError('Prazo e trajetórias devem ser inteiros positivos.');
  const cents = (v: number) => Math.round((v + Number.EPSILON * Math.abs(v)) * 100) / 100;
  const tax = i.dividendTaxRate ?? 0, reinvest = i.reinvestRatio ?? 1;
  const feePct = i.tradingCostPct ?? 0, fixed = i.tradingCostFixed ?? 0;
  const cashMonthly = Math.pow(1 + (i.cashYieldAnnual ?? 0), 1 / 12) - 1;
  const fees = (n: number, price: number) => n > 0 ? cents(n * price * feePct) + fixed : 0;
  const total = (n: number, price: number) => n * price + fees(n, price);
  const normal = rng(i.seed ?? 42);
  const years = Math.ceil(i.months / 12);
  const eq: number[][] = Array.from({ length: years }, () => []);
  const inc: number[][] = Array.from({ length: years }, () => []);
  const sigmaM = i.priceVolAnnual / Math.sqrt(12);
  const muM = Math.log(1 + i.priceDriftAnnual) / 12 - (sigmaM * sigmaM) / 2;
  const initialDividend = dec(i.dividend).mul(dec(1).add(i.dividendInitialChange ?? 0));
  const initialDps = i.dividendInitialChange ? truncate(initialDividend, 6).toNumber() : i.dividend;
  // Without dividend volatility, use the same non-cumulative decimal truncation as simulate().
  const deterministicDividends = i.dividendVolAnnual === 0 ? Array.from({ length: years }, (_, year) =>
    i.dividendInitialChange || i.dividendDriftAnnual
      ? truncate(initialDividend.mul(dec(1).add(i.dividendDriftAnnual).pow(year)), 6).toNumber()
      : i.dividend) : null;
  let hits = 0;
  for (let p = 0; p < i.paths; p++) {
    let price = i.price, dps = initialDps, shares = i.initialShares, cash = 0, hit = false, contrib = i.monthlyContribution;
    for (let t = 1; t <= i.months; t++) {
      if (t > 1 && (t - 1) % 12 === 0) {
        if (deterministicDividends) dps = deterministicDividends[Math.floor((t - 1) / 12)];
        else dps = Math.trunc(Math.max(0, dps * (1 + i.dividendDriftAnnual + i.dividendVolAnnual * normal())) * 1e6) / 1e6;
        if (i.contributionAdjustAnnual ?? true) contrib = i.monthlyContribution * Math.pow(1 + i.inflationAnnual, Math.floor((t - 1) / 12));
      }
      const gross = cents(shares * dps);
      const income = cents(gross - cents(gross * tax));
      const goalIncome = i.incomeGoalBasis === 'real' ? income / Math.pow(1 + i.inflationAnnual, t / 12) : income;
      if (i.incomeGoal > 0 && goalIncome >= i.incomeGoal) hit = true;
      price = Math.max(0.01, price * Math.exp(muM + sigmaM * normal()));
      const tradePrice = cents(price);
      const interest = Math.trunc(cash * cashMonthly * 100) / 100;
      const available = cents(cents(income * reinvest) + cash + interest + (t >= i.contributionStartMonth ? cents(contrib) : 0));
      let bought = Math.max(0, Math.floor((available - fixed) / (tradePrice * (1 + feePct))));
      // Fees are rounded to cents, so the estimate needs only a bounded correction.
      // Extreme statistical paths can exceed safe integer precision: n + 1 then equals n.
      for (let adjust = 0; adjust < 4 && bought > 0 && cents(total(bought, tradePrice)) > available; adjust++) bought--;
      for (let adjust = 0; adjust < 4 && bought + 1 > bought && cents(total(bought + 1, tradePrice)) <= available; adjust++) bought++;
      if (i.maxCostPct && i.maxCostPct > 0 && bought > 0 && fees(bought, tradePrice) > tradePrice * bought * i.maxCostPct) bought = 0;
      cash = Math.max(0, cents(available - total(bought, tradePrice)));
      shares += bought;
      if (t % 12 === 0 || t === i.months) { const k = Math.ceil(t / 12) - 1; eq[k].push(cents(shares * tradePrice + cash)); inc[k].push(income); }
    }
    if (hit) hits++;
  }
  const band = (arr: number[][]) => arr.map((v, k) => { const s = [...v].sort((a, b) => a - b); return { year: Math.min((k + 1) * 12, i.months) / 12, p10: pct(s, 0.1), p50: pct(s, 0.5), p90: pct(s, 0.9) }; });
  const equity = band(eq);
  const lastE = equity[equity.length - 1];
  return { equity, income: band(inc), goalProbability: hits / i.paths, finalEquity: { p10: lastE.p10, p50: lastE.p50, p90: lastE.p90 } };
}
