import type { MarketSnapshot, MarketStatus } from '../src/market/types';
import { isStale, saoPauloDate } from './calendar';
import type { MarketDataProvider } from './providers/types';
import type { JsonStore } from './store';
import { validateSnapshot } from './validate';

export class RefreshCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Atualização recente; tente novamente em ${retryAfterSeconds} s.`);
  }
}

export class MarketService {
  public nextScheduledRun: () => string | null = () => null;
  /** Atualizações em andamento por ativo: chamadas simultâneas compartilham a mesma promessa. */
  private inFlight = new Map<string, Promise<MarketStatus>>();
  private lastManual = new Map<string, number>();

  constructor(
    private readonly provider: MarketDataProvider,
    private readonly store: JsonStore,
    private readonly now: () => Date = () => new Date(),
    /** Intervalo mínimo entre atualizações manuais do mesmo ativo (protege as fontes oficiais). */
    private readonly manualCooldownMs = 5 * 60 * 1000,
  ) {}

  status(ticker: string): MarketStatus {
    const s = this.store.get(ticker);
    const t = s.snapshot?.lastTrade;
    const session = t ? (t.sessionDate ?? saoPauloDate(new Date(t.tradedAt))) : null;
    return {
      ticker,
      snapshot: s.snapshot,
      lastAttemptAt: s.lastAttemptAt,
      lastError: s.lastError,
      stale: isStale(session, s.snapshot?.fetchedAt ?? null, this.now()),
      providerConfigured: this.provider.isConfigured(),
      providerName: this.provider.name,
      automaticUpdates: this.provider.automatic && this.provider.isConfigured(),
      nextScheduledRun: this.nextScheduledRun(),
    };
  }

  /** Atualização solicitada por usuário: respeita o intervalo mínimo e reaproveita uma consulta em andamento. */
  async manualRefresh(ticker: string): Promise<MarketStatus> {
    const running = this.inFlight.get(ticker);
    if (running) return running;
    const last = this.lastManual.get(ticker) ?? 0;
    const wait = last + this.manualCooldownMs - this.now().getTime();
    if (wait > 0) throw new RefreshCooldownError(Math.ceil(wait / 1000));
    this.lastManual.set(ticker, this.now().getTime());
    return this.refresh(ticker);
  }

  /** Consulta o provedor. Em falha total, preserva o último conjunto válido; em falha parcial, completa com ele. */
  refresh(ticker: string): Promise<MarketStatus> {
    const running = this.inFlight.get(ticker);
    if (running) return running;
    const p = this.doRefresh(ticker).finally(() => this.inFlight.delete(ticker));
    this.inFlight.set(ticker, p);
    return p;
  }

  private async doRefresh(ticker: string): Promise<MarketStatus> {
    const attempt = this.now().toISOString();
    try {
      const fresh = await this.provider.fetchSnapshot(ticker);
      const prev = this.store.get(ticker).snapshot; // lido DEPOIS da consulta: nunca regrava dado antigo
      const merged = mergePartial(fresh, prev);
      const errs = validateSnapshot(merged);
      if (errs.length) throw new Error(`Dados rejeitados: ${errs.join(', ')}`);
      const partialMsg = fresh.partialErrors?.length ? `Falha parcial — mantido o último dado válido de: ${fresh.partialErrors.join('; ')}` : null;
      const { partialErrors: _pe, partial: _p, ...clean } = merged;
      this.store.set(ticker, { snapshot: clean, lastAttemptAt: attempt, lastError: partialMsg });
    } catch (e) {
      const msg = e instanceof Error ? (e.name === 'AbortError' ? 'tempo de resposta esgotado' : e.message) : String(e);
      const current = this.store.get(ticker); // relê: outra atualização pode ter gravado um dado mais novo
      this.store.set(ticker, { snapshot: current.snapshot, lastAttemptAt: attempt, lastError: msg });
    }
    return this.status(ticker);
  }
}

/** Completa a parte que falhou com o snapshot anterior (mesmo ativo). */
export function mergePartial(fresh: MarketSnapshot, prev: MarketSnapshot | null): MarketSnapshot {
  if (!fresh.partial || !prev || prev.ticker !== fresh.ticker) return fresh;
  return {
    ...fresh,
    lastTrade: fresh.partial.trade ? fresh.lastTrade : prev.lastTrade,
    ...(fresh.partial.dividends ? {} : {
      lastPaidDividend: prev.lastPaidDividend, lastAnnouncedDividend: prev.lastAnnouncedDividend,
      paymentLagBusinessDays: prev.paymentLagBusinessDays, administrator: prev.administrator,
    }),
  };
}
