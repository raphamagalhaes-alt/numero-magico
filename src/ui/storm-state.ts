import { stormLevel } from '../engine/storm';
import { loadCache } from '../markets/quotes';

/** Estado da bolsa a partir das cotações já guardadas neste aparelho (Ibovespa da página Mercados). */
export function currentStorm() {
  const q = loadCache().q['^BVSP'];
  const now = Date.now();
  const quoteTime = q?.time ? Date.parse(q.time) : NaN;
  // A recent fetch does not make an old market quote current.
  const referenceTime = Number.isFinite(quoteTime) ? quoteTime : q?.fetchedAt;
  const fresh = q && Number.isFinite(referenceTime) && referenceTime! <= now && now - referenceTime! < 3 * 86400_000
    && Number.isFinite(q.fetchedAt) && q.fetchedAt <= now && now - q.fetchedAt < 3 * 86400_000;
  const referenceLabel = Number.isFinite(referenceTime)
    ? new Date(referenceTime!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : null;
  return { ...stormLevel({ dayPct: fresh ? q.changePct : null, closes: fresh ? q.closes : [], price: fresh ? q.price : null }),
    hasData: Boolean(fresh), referenceLabel, referenceKind: Number.isFinite(quoteTime) ? 'Cotação' : 'Consulta' };
}
