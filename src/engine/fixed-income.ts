/**
 * Comparação com renda fixa: aplica exatamente os mesmos fluxos (investimento inicial no mês 0 e
 * aportes nos mesmos meses) a uma taxa anual constante, com IR regressivo por aporte (cada aporte
 * tem seu próprio prazo) e taxa de custódia opcional. Resultado bruto, IR e líquido no último mês.
 */
import { D, ONE, ZERO, dec, toCents, type Dec, type Numeric } from './decimal';
import type { SimulationResult } from './types';

export interface FixedIncomeInput {
  label: string;
  /** Taxa anual nominal (fração). Para IPCA+: (1 + real) × (1 + inflação) − 1, ver ipcaPlusNominal. */
  annualRate: Numeric;
  /** Taxa de custódia anual (fração), descontada mensalmente do saldo (ex.: 0,002 = 0,20% a.a.). */
  custodyAnnual?: Numeric;
  /** Aplica a tabela regressiva de IR (renda fixa tributável). false = isento (ex.: LCI/LCA). */
  regressiveTax?: boolean;
}

export interface FixedIncomeResult {
  label: string;
  gross: Dec;
  tax: Dec;
  net: Dec;
  invested: Dec;
  /** Líquido em reais de hoje (mesmo deflator da simulação). */
  netReal: Dec;
}

/** Tabela regressiva de IR por prazo da aplicação (em dias corridos). */
export function regressiveRate(days: number): Dec {
  if (days <= 180) return new D('0.225');
  if (days <= 360) return new D('0.2');
  if (days <= 720) return new D('0.175');
  return new D('0.15');
}

export function ipcaPlusNominal(realRate: Numeric, inflation: Numeric): Dec {
  return ONE.add(dec(realRate)).mul(ONE.add(dec(inflation))).sub(1);
}

export function compareFixedIncome(sim: SimulationResult, fi: FixedIncomeInput): FixedIncomeResult {
  const n = sim.rows.length;
  const monthly = ONE.add(dec(fi.annualRate)).pow(new D(1).div(12)).sub(1);
  const custody = fi.custodyAnnual ? ONE.add(dec(fi.custodyAnnual)).pow(new D(1).div(12)).sub(1) : ZERO;
  const growth = ONE.add(monthly).mul(ONE.sub(custody));
  // lotes: mês de aplicação (0 = inicial) e valor
  const lots: { month: number; amount: Dec }[] = [{ month: 0, amount: sim.summary.initialInvestment }];
  for (const r of sim.rows) if (r.contribution.gt(0)) lots.push({ month: r.month, amount: r.contribution });
  let gross = ZERO, tax = ZERO, invested = ZERO;
  for (const l of lots) {
    const value = l.amount.mul(growth.pow(n - l.month));
    const gain = value.sub(l.amount);
    const t = fi.regressiveTax === false || gain.lte(0) ? ZERO : toCents(gain.mul(regressiveRate(Math.round((n - l.month) * 30.4375))));
    gross = gross.add(value);
    tax = tax.add(t);
    invested = invested.add(l.amount);
  }
  gross = toCents(gross);
  const net = gross.sub(tax);
  return { label: fi.label, gross, tax, net, invested, netReal: net.div(sim.rows[n - 1].deflator) };
}
