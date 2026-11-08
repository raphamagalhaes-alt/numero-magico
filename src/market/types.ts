/**
 * Contrato dos dados de mercado. Cada campo carrega sua própria fonte e data —
 * a aplicação nunca exibe um valor sem procedência.
 */
export interface SourcedValue<T> {
  value: T;
  source: string;
  sourceUrl?: string;
}

export interface LastTrade {
  price: string; // decimal em string, precisão da origem
  tradedAt: string; // ISO 8601 do negócio/fechamento
  /** Data do pregão (AAAA-MM-DD) a que o preço se refere, quando conhecido. */
  sessionDate?: string;
  /** 'fechamento' = preço de fechamento oficial do pregão; 'negocio' = último negócio informado. */
  kind?: 'fechamento' | 'negocio';
  source: string;
  sourceUrl?: string;
}

export interface DividendEvent {
  /** R$ por cota, string decimal (pode ter 3+ casas). */
  amountPerShare: string;
  /** Data-com (último dia com direito). */
  recordDate: string;
  paymentDate: string;
  /** Data do anúncio/aviso aos cotistas, se conhecida. */
  announcedAt?: string;
  /** Rendimento isento de IR para pessoa física, conforme o aviso oficial. */
  taxExempt?: boolean;
  /** Mês de referência informado no aviso (ex.: "Outubro-2026"). */
  referencePeriod?: string;
  source: string;
  sourceUrl?: string;
}

export interface MarketSnapshot {
  ticker: string;
  provider: string;
  lastTrade: LastTrade | null;
  /** Último rendimento efetivamente pago. */
  lastPaidDividend: DividendEvent | null;
  /** Último rendimento anunciado e ainda não pago. */
  lastAnnouncedDividend: DividendEvent | null;
  /** Horário da última consulta bem-sucedida ao provedor. */
  fetchedAt: string;
  /** Prazo observado (dias úteis) entre data-com e pagamento no aviso mais recente. */
  paymentLagBusinessDays?: number;
  /** Administrador informado no documento oficial. */
  administrator?: string;
  /** Falhas parciais desta consulta (a parte que falhou foi mantida da consulta anterior). */
  partialErrors?: string[];
  partial?: { trade: boolean; dividends: boolean };
}

export interface MarketStatus {
  ticker: string;
  snapshot: MarketSnapshot | null;
  /** Última tentativa (bem ou malsucedida). */
  lastAttemptAt: string | null;
  lastError: string | null;
  /** true quando a última consulta bem-sucedida é anterior ao último pregão esperado. */
  stale: boolean;
  providerConfigured: boolean;
  providerName: string;
  automaticUpdates: boolean;
  nextScheduledRun: string | null;
}

/** Dividendo a usar por padrão no modo de mercado: o último anunciado; se não houver, o último pago. */
export function defaultDividend(s: MarketSnapshot): { event: DividendEvent; kind: 'anunciado' | 'pago' } | null {
  if (s.lastAnnouncedDividend) return { event: s.lastAnnouncedDividend, kind: 'anunciado' };
  if (s.lastPaidDividend) return { event: s.lastPaidDividend, kind: 'pago' };
  return null;
}
