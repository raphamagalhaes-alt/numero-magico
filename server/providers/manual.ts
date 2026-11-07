import { existsSync, readFileSync } from 'node:fs';
import type { MarketSnapshot } from '../../src/market/types';
import type { MarketDataProvider } from './types';

/**
 * Provedor manual: lê valores conferidos por uma pessoa em documentos oficiais
 * (ex.: aviso de rendimentos no Fundos.NET) a partir de um arquivo JSON.
 * Não há atualização automática — o "fetchedAt" é o horário da leitura do arquivo.
 */
export class ManualFileProvider implements MarketDataProvider {
  readonly name = 'manual';
  readonly automatic = false;
  constructor(private readonly path: string) {}

  isConfigured(): boolean {
    if (!existsSync(this.path)) return false;
    try {
      const all = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>;
      return Object.keys(all).some((k) => !k.startsWith('_'));
    } catch {
      return false;
    }
  }

  async fetchSnapshot(ticker: string): Promise<MarketSnapshot> {
    if (!existsSync(this.path)) throw new Error(`Arquivo de dados manuais não encontrado: ${this.path}`);
    const all = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, Omit<MarketSnapshot, 'fetchedAt' | 'provider' | 'ticker'>>;
    const entry = all[ticker];
    if (!entry) throw new Error(`Sem dados manuais para ${ticker}. Preencha ${this.path} com valores de fontes oficiais.`);
    return { ...entry, ticker, provider: this.name, fetchedAt: new Date().toISOString() };
  }
}
