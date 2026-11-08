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
}

export interface Band { year: number; p10: number; p50: number; p90: number }
export interface MonteCarloResult {
  equity: Band[];
  income: Band[];
  /** Probabilidade de a renda mensal (nominal) atingir a meta em algum momento até o fim. */
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
  const normal = rng(i.seed ?? 42);
  const years = Math.ceil(i.months / 12);
  const eq: number[][] = Array.from({ length: years }, () => []);
  const inc: number[][] = Array.from({ length: years }, () => []);
  const sigmaM = i.priceVolAnnual / Math.sqrt(12);
  const muM = Math.log(1 + i.priceDriftAnnual) / 12 - (sigmaM * sigmaM) / 2;
  let hits = 0;
  for (let p = 0; p < i.paths; p++) {
    let price = i.price, dps = i.dividend, shares = i.initialShares, cash = 0, hit = false, contrib = i.monthlyContribution;
    for (let t = 1; t <= i.months; t++) {
      if (t > 1 && (t - 1) % 12 === 0) {
        dps = Math.max(0, dps * (1 + i.dividendDriftAnnual + i.dividendVolAnnual * normal()));
        contrib *= 1 + i.inflationAnnual;
      }
      const income = Math.round(shares * dps * 100) / 100;
      if (i.incomeGoal > 0 && income >= i.incomeGoal) hit = true;
      price = Math.max(0.01, price * Math.exp(muM + sigmaM * normal()));
      const available = income + cash + (t >= i.contributionStartMonth ? Math.round(contrib * 100) / 100 : 0);
      const bought = Math.floor(available / price);
      cash = available - bought * price;
      shares += bought;
      if (t % 12 === 0) { eq[t / 12 - 1].push(shares * price + cash); inc[t / 12 - 1].push(income); }
    }
    if (hit) hits++;
  }
  const band = (arr: number[][]) => arr.map((v, k) => { const s = [...v].sort((a, b) => a - b); return { year: k + 1, p10: pct(s, 0.1), p50: pct(s, 0.5), p90: pct(s, 0.9) }; });
  const equity = band(eq);
  const lastE = equity[equity.length - 1];
  return { equity, income: band(inc), goalProbability: hits / i.paths, finalEquity: { p10: lastE.p10, p50: lastE.p50, p90: lastE.p90 } };
}
