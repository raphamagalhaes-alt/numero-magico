/**
 * Indicadores objetivos calculados a partir de dados oficiais (sem opinião ou recomendação).
 * Usa ponto flutuante: são estatísticas descritivas, não valores monetários contábeis.
 */
export interface DailyPoint { date: string; close: number; volume: number }

export function pctChange(points: DailyPoint[], sessionsBack: number): number | null {
  if (points.length <= sessionsBack) return null;
  const a = points[points.length - 1 - sessionsBack].close;
  const b = points[points.length - 1].close;
  return a > 0 ? b / a - 1 : null;
}

/** Desvio-padrão amostral dos retornos log diários × √252. */
export function annualizedVolatility(points: DailyPoint[], window = 252): number | null {
  const p = points.slice(-window - 1);
  if (p.length < 22) return null;
  const r: number[] = [];
  for (let i = 1; i < p.length; i++) if (p[i - 1].close > 0 && p[i].close > 0) r.push(Math.log(p[i].close / p[i - 1].close));
  if (r.length < 20) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function maxDrawdown(points: DailyPoint[], window = 252): number | null {
  const p = points.slice(-window);
  if (p.length < 2) return null;
  let peak = p[0].close;
  let mdd = 0;
  for (const x of p) {
    peak = Math.max(peak, x.close);
    if (peak > 0) mdd = Math.min(mdd, x.close / peak - 1);
  }
  return mdd;
}

export function averageVolume(points: DailyPoint[], window = 21): number | null {
  const p = points.slice(-window);
  if (!p.length) return null;
  return p.reduce((a, b) => a + b.volume, 0) / p.length;
}

export interface DividendLike { amount: number; recordDate: string; paymentDate: string }

/** Soma dos rendimentos com data-com nos 365 dias até asOf, dividida pelo preço. */
export function dividendYield12m(divs: DividendLike[], price: number, asOf: string): { dy: number | null; count: number } {
  if (!(price > 0)) return { dy: null, count: 0 };
  const from = new Date(new Date(asOf + 'T12:00:00Z').getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const inWin = divs.filter((d) => d.recordDate > from && d.recordDate <= asOf);
  if (!inWin.length) return { dy: null, count: 0 };
  return { dy: inWin.reduce((a, d) => a + d.amount, 0) / price, count: inWin.length };
}

/** Série normalizada em base 100 para comparar ativos lado a lado. */
export function rebase(points: DailyPoint[], from?: string): { date: string; value: number }[] {
  const p = from ? points.filter((x) => x.date >= from) : points;
  if (!p.length || !(p[0].close > 0)) return [];
  return p.map((x) => ({ date: x.date, value: (x.close / p[0].close) * 100 }));
}
