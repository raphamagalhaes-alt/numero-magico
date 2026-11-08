/**
 * Indicadores por ativo — lógica pura, compartilhada entre o servidor local (app desktop) e o
 * modo navegador (site). Não depende de Node nem de rede.
 */
import { addDays } from '../engine/calendar';
import { annualizedVolatility, averageVolume, dividendYield12m, maxDrawdown, pctChange, type DailyPoint } from './metrics';
import type { AssetClassCode, AssetMetrics } from './universe';

export interface MetaInfo { name: string; cls: AssetClassCode; isin: string; spec: string }
export interface FiiInfoLite { cnpj: string; vpPerShare: number | null; shareholders: number | null; segment: string | null; administrator: string | null; refDate: string }
export interface DivEvent { amount: number; recordDate: string; paymentDate: string; kind?: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO' | 'OUTRO' }

export interface MetricsContext {
  today: string;
  fii?: FiiInfoLite | null;
  /** Rendimentos de FII/Fiagro (ordenados por data-com). */
  fundDividends?: DivEvent[];
  /** Data inicial da cobertura contínua dos rendimentos de fundos (DY 12m só com 12 meses). */
  fundCoverageFrom?: string | null;
  /** Rendimento estimado pela CVM (informe mensal), usado quando não há avisos por evento. */
  fundEstimated?: boolean;
  /** Proventos de ações por evento. */
  stockDividends?: DivEvent[];
}

export function computeMetrics(ticker: string, meta: MetaInfo, pts: DailyPoint[], ctx: MetricsContext): AssetMetrics | null {
  const last = pts[pts.length - 1];
  if (!last) return null;
  const m: AssetMetrics = {
    ticker, name: meta.name, cls: meta.cls, isin: meta.isin, spec: meta.spec, close: last.close, sessionDate: last.date,
    chg1d: pctChange(pts, 1), chg1m: pctChange(pts, 21), chg12m: pctChange(pts, 252) ?? (pts.length > 200 ? pctChange(pts, pts.length - 1) : null),
    avgVolume21: averageVolume(pts, 21), vol12m: annualizedVolatility(pts), maxDrawdown12m: maxDrawdown(pts), sessions: pts.length,
  };
  const today = ctx.today;
  if (meta.cls === 'ACAO' && ctx.stockDividends?.length) {
    const ev = ctx.stockDividends;
    const lastEv = ev[ev.length - 1];
    const dy = dividendYield12m(ev, m.close, today);
    Object.assign(m, {
      lastDividend: { amount: lastEv.amount, recordDate: lastEv.recordDate, paymentDate: lastEv.paymentDate, announced: !lastEv.paymentDate || lastEv.paymentDate > today, kind: lastEv.kind },
      dy12m: dy.dy, dividends12mCount: dy.count, dyAnnualizedLast: null,
    });
  }
  if (meta.cls === 'FII' || meta.cls === 'FIAGRO') {
    const info = ctx.fii ?? null;
    const divs = ctx.fundDividends ?? [];
    const lastDiv = divs[divs.length - 1];
    const cov = ctx.fundCoverageFrom;
    const fullCoverage = Boolean(cov && cov <= addDays(today, -335));
    const dy = fullCoverage ? dividendYield12m(divs, last.close, today) : { dy: null, count: 0 };
    const ratio = info?.vpPerShare ? last.close / info.vpPerShare : null;
    const plausible = ratio !== null && ratio >= 0.2 && ratio <= 5;
    Object.assign(m, {
      cnpj: info?.cnpj, vpPerShare: info?.vpPerShare ?? null,
      // P/VP fora de 0,2–5 indica VP/cota incompatível com a cota negociada (desdobramento/grupamento recente)
      pvp: plausible ? ratio : null,
      pvpInconsistent: ratio !== null && !plausible,
      shareholders: info?.shareholders ?? null, segment: info?.segment ?? null, administrator: info?.administrator ?? null, cvmRefDate: info?.refDate ?? null,
      lastDividend: lastDiv ? { amount: lastDiv.amount, recordDate: lastDiv.recordDate, paymentDate: lastDiv.paymentDate, announced: lastDiv.paymentDate > today } : null,
      dy12m: dy.dy, dividends12mCount: dy.count, dyAnnualizedLast: lastDiv ? (lastDiv.amount * 12) / last.close : null,
      ...(ctx.fundEstimated ? { dividendsEstimated: true } : {}),
    });
  }
  return m;
}
