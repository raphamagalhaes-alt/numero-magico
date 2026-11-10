/** Estado e números do plano de liberdade, compartilhados por Liberdade, Meu mês e Custo em liberdade. */
import { useMemo } from 'react';
import { incrementalFreedomPlan, coverage, type Bill } from '../engine/freedom';
import { useMacro, useUniverse } from './data';
import { loadRaw } from './storage';
import { loadPositions, portfolioTotals } from './pages/Portfolio';

export const FREEDOM_KEY = 'mxrf:freedom';
export interface FreedomState { bills: Bill[]; extraIncome: string; extraCapital: string; contribution: string; rate: string; years: string }
export const FREEDOM_DEFAULT: FreedomState = {
  bills: [
    { name: 'Celular', amount: 60 }, { name: 'Água', amount: 90 }, { name: 'Internet', amount: 120 }, { name: 'Luz', amount: 200 },
    { name: 'Lazer', amount: 300 }, { name: 'Transporte', amount: 400 }, { name: 'Saúde', amount: 400 }, { name: 'Mercado', amount: 1200 }, { name: 'Moradia', amount: 1500 },
  ],
  extraIncome: '0', extraCapital: '0', contribution: '500', rate: '', years: '15',
};
export const num = (s: string) => { const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const loadFreedom = (): FreedomState => ({ ...FREEDOM_DEFAULT, ...loadRaw<Partial<FreedomState>>(FREEDOM_KEY, {}) });

/** Taxa real "de mercado": Tesouro IPCA+ mais longo à venda (quanto o governo paga acima da inflação). */
export function useIpcaPlus(): { rate: number; label: string } | null {
  const macro = useMacro();
  return useMemo(() => {
    const b = (macro.data?.tesouro.bonds ?? []).filter((x) => /IPCA\+/.test(x.type) && !/Semestrais|Renda|Educa/i.test(x.type) && x.buyRate).sort((a, c) => c.maturity.localeCompare(a.maturity))[0];
    return b?.buyRate ? { rate: b.buyRate > 1 ? b.buyRate / 100 : b.buyRate, label: `${b.type} ${b.maturity.slice(0, 4)}` } : null;
  }, [macro.data]);
}

/** Números do plano a partir do estado salvo (ou do estado em edição na página Liberdade). */
export function useFreedomPlan(state?: FreedomState) {
  const u = useUniverse();
  const ipca = useIpcaPlus();
  const s = state ?? loadFreedom();
  const rate = s.rate ? num(s.rate) / 100 : ipca?.rate ?? 0.06;
  const pf = portfolioTotals(loadPositions(), u.data?.assets ?? []);
  const otherCapitalIncome = Math.round((num(s.extraCapital) * rate / 12) * 100) / 100;
  const income = pf.income + num(s.extraIncome) + otherCapitalIncome;
  const capital = pf.value + num(s.extraCapital);
  const cov = coverage(s.bills, income);
  const { missingCapital, projection } = incrementalFreedomPlan(cov.total - income, num(s.contribution), rate);
  const target = projection.target;
  return { s, ipca, rate, pf, otherCapitalIncome, income, capital, contribution: num(s.contribution), cov, missingCapital, target, projection };
}
