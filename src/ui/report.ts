import type { SimulationResult } from '../engine';
import { fmtBRL, fmtBRLPrecise, fmtInt, fmtPct } from './format';

export const DISCLAIMER =
  'Simulação educativa. Fundos imobiliários são investimentos de renda variável. Preços, distribuições de rendimentos, inflação, liquidez e condições tributárias podem mudar. Resultados projetados não representam garantia de rentabilidade ou renda futura. Não constitui recomendação de investimento.';

/** Premissas do modelo (o que é hipótese, e não dado observado). */
export const LIMITATIONS = [
  'Preço e dividendo constantes nas abas principais; variações somente no Laboratório de Cenários. Valores futuros são hipóteses, não previsões.',
  'Datas: data-com no último dia útil do mês e pagamento N dias úteis depois (calendário B3), padrão observado nos avisos oficiais; o fundo pode alterar o cronograma.',
  'Compras de cotas inteiras ao preço do mês, na data de pagamento, sem spread nem impacto de liquidez.',
  'Custos, alíquotas de IR e remuneração do caixa são os informados nas premissas avançadas; confira as tabelas vigentes da sua corretora, da B3 e a legislação.',
  'A isenção de IR sobre rendimentos de FII para pessoa física depende de requisitos do fundo e do cotista e pode ser alterada por lei; o aviso do fundo não garante a isenção para cada investidor.',
  'O patrimônio líquido se vendido considera IR sobre ganho de capital apenas na venda total hipotética do mês.',
];

export const TAB_LABEL = { nominal: 'Nominal', inflacao: 'Inflação', aportes: 'Aportes mensais' } as const;

export function reportMeta(r: SimulationResult, tab: keyof typeof TAB_LABEL, statusLabel: string, ticker: string): string[] {
  const i = r.input;
  return [
    `Número Mágico — relatório de simulação (${ticker})`,
    `Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília)`,
    `Cenário: aba ${TAB_LABEL[tab]} · Origem dos dados: ${statusLabel}`,
    `Preço da cota: ${fmtBRLPrecise(i.price)} · Dividendo mensal por cota: ${fmtBRLPrecise(i.dividend)} · Cotas desejadas/mês: ${i.desiredShares}`,
    `Número mágico: ${fmtInt(r.magic.shares)} cotas · Investimento inicial: ${fmtBRL(r.summary.initialInvestment)}`,
    `Inflação anual: ${fmtPct(i.inflationAnnual)} · Aporte mensal base: ${fmtBRL(i.monthlyContribution)} (a partir do mês ${i.contributionStartMonth}, reajuste anual)`,
    `Meta de renda: ${fmtBRL(i.incomeGoal)} (${i.incomeGoalBasis}) · Prazo: ${i.months} meses`,
    `Datas: 1º pagamento em ${i.startMonth ?? '—'}, ${i.paymentLagBusinessDays ?? 10} dias úteis após a data-com · Custos: ${fmtPct(i.tradingCostPct ?? 0)} + ${fmtBRL(i.tradingCostFixed ?? 0)}/ordem · IR rendimentos: ${fmtPct(i.dividendTaxRate ?? 0)} · IR ganho de capital: ${fmtPct(i.capitalGainsTaxRate ?? 0)} · Caixa: ${fmtPct(i.cashYieldAnnual ?? 0)} a.a.`,
    `Limitações: ${LIMITATIONS.join(' ')}`,
    DISCLAIMER,
  ];
}
