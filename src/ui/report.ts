import type { SimulationResult } from '../engine';
import { fmtBRL, fmtBRLPrecise, fmtInt, fmtPct } from './format';

export const DISCLAIMER =
  'Simulação educativa. Fundos imobiliários são investimentos de renda variável. Preços, distribuições de rendimentos, inflação, liquidez e condições tributárias podem mudar. Resultados projetados não representam garantia de rentabilidade ou renda futura. Não constitui recomendação de investimento.';

export const LIMITATIONS = [
  'Preço e dividendo constantes nas abas principais (variações apenas no Laboratório de Cenários).',
  'Datas de elegibilidade (data-com), prazos de pagamento e liquidação simplificados em períodos mensais.',
  'Cotas compradas no mês só rendem a partir do mês seguinte.',
  'Sem custos de corretagem, emolumentos, spread ou impacto de liquidez.',
  'Sem tributação (rendimentos de FII podem ter isenção condicionada para pessoa física; ganho de capital é tributado).',
  'Compras apenas de cotas inteiras ao preço do mês; o saldo residual fica em caixa sem remuneração.',
];

export const TAB_LABEL = { nominal: 'Nominal', inflacao: 'Inflação', aportes: 'Aportes mensais' } as const;

export function reportMeta(r: SimulationResult, tab: keyof typeof TAB_LABEL, statusLabel: string, ticker: string): string[] {
  const i = r.input;
  return [
    `MXRF11 · O Número Mágico — relatório de simulação (${ticker})`,
    `Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (horário de Brasília)`,
    `Cenário: aba ${TAB_LABEL[tab]} · Origem dos dados: ${statusLabel}`,
    `Preço da cota: ${fmtBRLPrecise(i.price)} · Dividendo mensal por cota: ${fmtBRLPrecise(i.dividend)} · Cotas desejadas/mês: ${i.desiredShares}`,
    `Número mágico: ${fmtInt(r.magic.shares)} cotas · Investimento inicial: ${fmtBRL(r.summary.initialInvestment)}`,
    `Inflação anual: ${fmtPct(i.inflationAnnual)} · Aporte mensal base: ${fmtBRL(i.monthlyContribution)} (a partir do mês ${i.contributionStartMonth}, reajuste anual)`,
    `Meta de renda: ${fmtBRL(i.incomeGoal)} (${i.incomeGoalBasis}) · Prazo: ${i.months} meses`,
    `Limitações: ${LIMITATIONS.join(' ')}`,
    DISCLAIMER,
  ];
}
