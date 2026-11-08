/**
 * Cotações da página Mercados, buscadas DIRETO do aparelho de cada pessoa com a chave pessoal dela
 * na brapi (cabeçalho Authorization; nunca na URL, nunca no código publicado). Guardadas só neste
 * aparelho (localStorage). Plano gratuito: 1 ativo por consulta, ~15 mil consultas/mês, histórico
 * de até 3 meses e atraso de cerca de 30 minutos — por isso há cache e um limite mensal de segurança.
 */
export interface Quote {
  price: number; change: number | null; changePct: number | null; time: string | null; name: string | null;
  closes: number[]; histDay: string | null; fetchedAt: number; error?: string;
}
interface Cache { q: Record<string, Quote>; month: string; used: number }

const KEY = 'mxrf:markets';
export const MONTHLY_BUDGET = 12000; // margem abaixo das ~15 mil do plano gratuito
const spDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const spHour = (d = new Date()) => Number(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24;
const spWeekday = (d = new Date()) => new Date(`${spDate(d)}T12:00:00Z`).getUTCDay();

export function loadCache(): Cache {
  const month = spDate().slice(0, 7);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Cache | null;
    if (v && typeof v === 'object' && v.q) return v.month === month ? v : { ...v, month, used: 0 };
  } catch { /* ignore */ }
  return { q: {}, month, used: 0 };
}
function saveCache(c: Cache) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* cheio ou bloqueado */ } }

/** Pregão aberto (aprox. 10h–18h, seg–sex, horário de Brasília). */
export const marketOpen = (d = new Date()) => { const w = spWeekday(d), h = spHour(d); return w >= 1 && w <= 5 && h >= 10 && h < 18; };

/** Fechamento oficial mais recente (18h15 de Brasília = 21h15 UTC) até `now`. */
export function lastCloseMs(now = new Date()): number {
  let d = new Date(now);
  const wk = (x: Date) => spWeekday(x) >= 1 && spWeekday(x) <= 5;
  if (!(wk(d) && (spHour(d) > 18 || (spHour(d) === 18 && d.getUTCMinutes() >= 15)))) {
    do d = new Date(d.getTime() - 86_400_000); while (!wk(d));
  }
  return Date.parse(`${spDate(d)}T21:15:00Z`);
}

/** Precisa buscar de novo? Pregão aberto: a cada 30 min; fora dele: só se for anterior ao último fechamento. */
export function isStale(q: Quote | undefined, now = new Date()): boolean {
  if (!q) return true;
  if (marketOpen(now)) return now.getTime() - q.fetchedAt > 30 * 60_000;
  return q.fetchedAt < lastCloseMs(now);
}

/** Variação entre o último preço e o fechamento de `n` pregões atrás (null se não houver histórico). */
export function changeOver(q: Quote | undefined, n: number): number | null {
  if (!q || q.closes.length < 2) return null;
  const base = n >= q.closes.length ? q.closes[0] : q.closes[q.closes.length - 1 - n];
  return base > 0 ? q.price / base - 1 : null;
}

export type RefreshResult = { updated: number; failed: string[]; stopped?: string };

/** Atualiza os símbolos pedidos que estiverem desatualizados (3 em paralelo). */
export async function refreshQuotes(symbols: string[], token: string, opts: { force?: boolean; onProgress?: (done: number, total: number) => void; fetchFn?: typeof fetch } = {}): Promise<RefreshResult> {
  const f = opts.fetchFn ?? fetch;
  const cache = loadCache();
  const todo = symbols.filter((s) => opts.force || isStale(cache.q[s]));
  const res: RefreshResult = { updated: 0, failed: [] };
  let i = 0, done = 0;
  const today = spDate();
  const worker = async () => {
    while (i < todo.length && !res.stopped) {
      const sym = todo[i++];
      if (cache.used >= MONTHLY_BUDGET) { res.stopped = 'Limite mensal de segurança atingido (plano gratuito). As cotações voltam no próximo mês.'; break; }
      const prev = cache.q[sym];
      const hist = !prev || prev.histDay !== today;
      try {
        cache.used++;
        const r = await f(`https://brapi.dev/api/quote/${encodeURIComponent(sym)}${hist ? '?range=3mo&interval=1d' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401 || r.status === 403) { res.stopped = 'A brapi recusou a chave. Confira se copiou a chave certa na página Cotações.'; break; }
        if (r.status === 429) { res.stopped = 'Limite do plano gratuito da brapi atingido. Tente mais tarde.'; break; }
        const body = await r.json().catch(() => null) as { results?: Record<string, unknown>[] } | null;
        const x = body?.results?.[0];
        const price = Number(x?.regularMarketPrice);
        if (!r.ok || !x || !(price > 0)) { res.failed.push(sym); continue; }
        const closes = hist
          ? ((x.historicalDataPrice as { close?: number }[] | undefined) ?? []).map((h) => Number(h.close)).filter((v) => v > 0).slice(-66)
          : prev?.closes ?? [];
        cache.q[sym] = {
          price, change: Number.isFinite(Number(x.regularMarketChange)) ? Number(x.regularMarketChange) : null,
          changePct: Number.isFinite(Number(x.regularMarketChangePercent)) ? Number(x.regularMarketChangePercent) / 100 : null,
          time: typeof x.regularMarketTime === 'string' ? x.regularMarketTime : null,
          name: typeof x.longName === 'string' ? x.longName : null,
          closes, histDay: hist ? today : prev?.histDay ?? null, fetchedAt: Date.now(),
        };
        res.updated++;
      } catch { res.failed.push(sym); } finally { opts.onProgress?.(++done, todo.length); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  saveCache(cache);
  return res;
}
