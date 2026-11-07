import type { MarketStatus } from '../src/market/types';
import { isStale } from './calendar';
import type { MarketDataProvider } from './providers/types';
import type { JsonStore } from './store';
import { validateSnapshot } from './validate';

export class MarketService {
  public nextScheduledRun: () => string | null = () => null;
  constructor(private readonly provider: MarketDataProvider, private readonly store: JsonStore, private readonly now: () => Date = () => new Date()) {}

  status(ticker: string): MarketStatus {
    const s = this.store.get(ticker);
    return {
      ticker,
      snapshot: s.snapshot,
      lastAttemptAt: s.lastAttemptAt,
      lastError: s.lastError,
      stale: isStale(s.snapshot?.lastTrade?.tradedAt ?? null, s.snapshot?.fetchedAt ?? null, this.now()),
      providerConfigured: this.provider.isConfigured(),
      providerName: this.provider.name,
      automaticUpdates: this.provider.automatic && this.provider.isConfigured(),
      nextScheduledRun: this.nextScheduledRun(),
    };
  }

  /** Consulta o provedor. Em falha, preserva o último conjunto válido e registra o erro. */
  async refresh(ticker: string): Promise<MarketStatus> {
    const prev = this.store.get(ticker);
    const attempt = this.now().toISOString();
    try {
      const snap = await this.provider.fetchSnapshot(ticker);
      const errs = validateSnapshot(snap);
      if (errs.length) throw new Error(`Dados rejeitados: ${errs.join(', ')}`);
      this.store.set(ticker, { snapshot: snap, lastAttemptAt: attempt, lastError: null });
    } catch (e) {
      this.store.set(ticker, { snapshot: prev.snapshot, lastAttemptAt: attempt, lastError: e instanceof Error ? e.message : String(e) });
    }
    return this.status(ticker);
  }
}
