/** Tipos compartilhados do universo de ativos, indicadores macro e juros globais. */
export type AssetClassCode = 'ACAO' | 'FII' | 'FIAGRO' | 'ETF' | 'FUNDO' | 'BDR';

export const CLASS_LABEL: Record<AssetClassCode, string> = {
  ACAO: 'Ações', FII: 'FIIs', FIAGRO: 'Fiagro', ETF: 'ETFs', FUNDO: 'Outros fundos listados', BDR: 'BDRs',
};

export interface AssetMetrics {
  ticker: string;
  name: string;
  cls: AssetClassCode;
  isin: string;
  spec: string;
  /** Último fechamento oficial (B3) e data do pregão. */
  close: number;
  sessionDate: string;
  /** Variações (fração) em 1 dia, ~1 mês (21 pregões), ~12 meses (252 pregões) quando houver histórico. */
  chg1d: number | null;
  chg1m: number | null;
  chg12m: number | null;
  /** Volume financeiro médio diário (R$) nos últimos 21 pregões com negócio. */
  avgVolume21: number | null;
  /** Volatilidade anualizada (desvio-padrão dos retornos log diários × √252), 12 meses. */
  vol12m: number | null;
  /** Máxima queda do pico ao vale em 12 meses (fração negativa). */
  maxDrawdown12m: number | null;
  sessions: number;
  // ---- apenas FII/Fiagro (Fundos.NET + CVM) ----
  cnpj?: string;
  lastDividend?: { amount: number; recordDate: string; paymentDate: string; announced: boolean } | null;
  /** Soma dos rendimentos com data-com nos últimos 12 meses / preço (cobertura informada). */
  dy12m?: number | null;
  dividends12mCount?: number;
  /** Último rendimento × 12 / preço. */
  dyAnnualizedLast?: number | null;
  /** Valor patrimonial por cota (CVM, informe mensal) e P/VP. */
  vpPerShare?: number | null;
  pvp?: number | null;
  /** true quando o VP/cota da CVM não é compatível com a cota negociada (ex.: desdobramento recente). */
  pvpInconsistent?: boolean;
  shareholders?: number | null;
  segment?: string | null;
  administrator?: string | null;
  cvmRefDate?: string | null;
}

export interface UniverseResponse {
  asOf: string | null;
  sessions: number;
  historyFrom: string | null;
  dividendsCoverageFrom: string | null;
  assets: AssetMetrics[];
}

export interface AssetDetail {
  metrics: AssetMetrics;
  history: { date: string; close: number; volume: number }[];
  dividends: { amount: number; recordDate: string; paymentDate: string; taxExempt?: boolean; source: string; sourceUrl?: string }[];
}

export interface MacroSeriesPoint { date: string; value: number }
export interface MacroIndicator {
  code: number;
  key: string;
  label: string;
  unit: string;
  last: MacroSeriesPoint | null;
  history: MacroSeriesPoint[];
  source: string;
  sourceUrl: string;
}
export interface TesouroBond {
  type: string;
  maturity: string;
  baseDate: string;
  buyRate: number | null;
  sellRate: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
}
export interface MacroResponse {
  indicators: MacroIndicator[];
  tesouro: { baseDate: string | null; bonds: TesouroBond[]; source: string; sourceUrl: string };
}

export interface PolicyRate {
  country: string;
  centralBank: string;
  rate: number;
  date: string;
  source: string;
  sourceUrl: string;
  note?: string;
}
export interface GlobalRatesResponse { rates: PolicyRate[] }

export interface DatasetStatus {
  key: string;
  label: string;
  lastSuccess: string | null;
  lastAttempt: string | null;
  lastError: string | null;
  asOf: string | null;
  schedule: string;
}
