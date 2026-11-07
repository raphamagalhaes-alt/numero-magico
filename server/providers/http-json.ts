import type { MarketSnapshot } from '../../src/market/types';
import type { MarketDataProvider } from './types';

/**
 * Adaptador genérico para um fornecedor LICENCIADO ou serviço interno que exponha o
 * contrato MarketSnapshot em JSON. Configure:
 *   MARKET_PROVIDER_URL=https://seu-fornecedor/caminho/{ticker}
 *   MARKET_PROVIDER_TOKEN=... (opcional, enviado como Authorization: Bearer)
 *   MARKET_PROVIDER_NAME=nome exibido como fonte
 * Nenhum fornecedor específico vem configurado: use apenas fontes cujos termos permitam o uso.
 */
export class HttpJsonProvider implements MarketDataProvider {
  readonly automatic = true;
  constructor(
    private readonly urlTemplate: string | undefined,
    private readonly token: string | undefined,
    readonly name: string = 'http-json',
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 15000,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.urlTemplate);
  }

  async fetchSnapshot(ticker: string): Promise<MarketSnapshot> {
    if (!this.urlTemplate) throw new Error('MARKET_PROVIDER_URL não configurada.');
    const url = this.urlTemplate.replace('{ticker}', encodeURIComponent(ticker));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Fornecedor respondeu HTTP ${res.status}`);
      const body = (await res.json()) as Omit<MarketSnapshot, 'fetchedAt'>;
      return { ...body, ticker, provider: this.name, fetchedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }
}
