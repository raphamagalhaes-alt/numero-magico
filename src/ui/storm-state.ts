import { stormLevel } from '../engine/storm';
import { loadCache } from '../markets/quotes';

/** Estado da bolsa a partir das cotações já guardadas neste aparelho (Ibovespa da página Mercados). */
export function currentStorm() {
  const q = loadCache().q['^BVSP'];
  const fresh = q && Date.now() - q.fetchedAt < 3 * 86400_000;
  return { ...stormLevel({ dayPct: fresh ? q.changePct : null, closes: fresh ? q.closes : [], price: fresh ? q.price : null }), hasData: Boolean(fresh) };
}
