import type { MarketSnapshot } from '../../src/market/types';

export interface MarketDataProvider {
  readonly name: string;
  /** true quando há fonte configurada (arquivo manual preenchido ou URL licenciada). */
  isConfigured(): boolean;
  /** true somente para fontes que atualizam sozinhas (integrações licenciadas). */
  readonly automatic: boolean;
  fetchSnapshot(ticker: string): Promise<MarketSnapshot>;
}
