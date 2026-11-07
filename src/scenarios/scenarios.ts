import type { SimulationInput } from '../engine';

/**
 * Gerenciador de cenários do Laboratório. Cenários são HIPÓTESES matemáticas para
 * análise de sensibilidade — não previsões sobre o MXRF11.
 */
export type ScenarioKind = 'estavel' | 'conservador' | 'otimista' | 'personalizado';

export interface ScenarioParams {
  /** Corte inicial do dividendo, em fração positiva (0.1 = −10%). Conservador. */
  dividendCut: number;
  /** Variação anual do preço (fração). */
  priceAnnualChange: number;
  /** Crescimento anual do dividendo (fração). */
  dividendAnnualChange: number;
  /** Inflação anual (fração). Personalizado. */
  inflationAnnual: number;
  /** Aporte mensal (R$). Personalizado. */
  monthlyContribution: number;
}

export interface ScenarioDefinition {
  kind: ScenarioKind;
  label: string;
  description: string;
  editable: (keyof ScenarioParams)[];
  defaults: ScenarioParams;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    kind: 'estavel', label: 'Estável', description: 'Preço e dividendo constantes.',
    editable: [],
    defaults: { dividendCut: 0, priceAnnualChange: 0, dividendAnnualChange: 0, inflationAnnual: 0.06, monthlyContribution: 0 },
  },
  {
    kind: 'conservador', label: 'Conservador', description: 'Dividendo reduzido e preço com variação anual configurável.',
    editable: ['dividendCut', 'priceAnnualChange'],
    defaults: { dividendCut: 0.1, priceAnnualChange: -0.01, dividendAnnualChange: 0, inflationAnnual: 0.06, monthlyContribution: 0 },
  },
  {
    kind: 'otimista', label: 'Otimista', description: 'Crescimento gradual do dividendo e valorização anual configurável.',
    editable: ['dividendAnnualChange', 'priceAnnualChange'],
    defaults: { dividendCut: 0, priceAnnualChange: 0.02, dividendAnnualChange: 0.02, inflationAnnual: 0.06, monthlyContribution: 0 },
  },
  {
    kind: 'personalizado', label: 'Personalizado', description: 'Variações independentes de preço e dividendo, inflação e aportes.',
    editable: ['priceAnnualChange', 'dividendAnnualChange', 'inflationAnnual', 'monthlyContribution'],
    defaults: { dividendCut: 0, priceAnnualChange: 0.01, dividendAnnualChange: 0.01, inflationAnnual: 0.045, monthlyContribution: 250 },
  },
];

export function scenarioDefinition(kind: ScenarioKind): ScenarioDefinition {
  const s = SCENARIOS.find((x) => x.kind === kind);
  if (!s) throw new Error(`Cenário desconhecido: ${kind}`);
  return s;
}

/** Aplica um cenário sobre os parâmetros-base (preço, dividendo, número mágico, meta). */
export function buildScenarioInput(base: SimulationInput, kind: ScenarioKind, params: ScenarioParams): SimulationInput {
  const common = { ...base, priceAnnualChange: 0, dividendAnnualChange: 0, dividendInitialChange: 0 };
  switch (kind) {
    case 'estavel':
      return { ...common, monthlyContribution: 0 };
    case 'conservador':
      return { ...common, monthlyContribution: 0, dividendInitialChange: -Math.abs(params.dividendCut), priceAnnualChange: params.priceAnnualChange };
    case 'otimista':
      return { ...common, monthlyContribution: 0, dividendAnnualChange: params.dividendAnnualChange, priceAnnualChange: params.priceAnnualChange };
    case 'personalizado':
      return {
        ...common,
        priceAnnualChange: params.priceAnnualChange,
        dividendAnnualChange: params.dividendAnnualChange,
        inflationAnnual: params.inflationAnnual,
        monthlyContribution: params.monthlyContribution,
        contributionStartMonth: 2,
        contributionAdjustAnnual: true,
      };
  }
}
