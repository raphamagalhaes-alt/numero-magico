/** Núcleo do histórico de fechamentos/volumes por ativo (últimos N pregões) — puro, sem Node. */
import type { AssetClassCode } from './universe';
import { classify, type CotahistRecord } from '../../server/sources/cotahist';
import type { DailyPoint } from './metrics';

export interface Meta { name: string; cls: AssetClassCode; isin: string; spec: string }
export interface HistoryJson {
  dates: string[]; // pregões em ordem crescente
  close: Record<string, (number | null)[]>;
  volume: Record<string, (number | null)[]>;
  meta: Record<string, Meta>;
}

export class HistoryData {
  protected d: HistoryJson = { dates: [], close: {}, volume: {}, meta: {} };
  constructor(protected readonly maxSessions = 300, data?: HistoryJson | null) {
    if (data && Array.isArray(data.dates)) this.d = data;
  }
  toJSON(): HistoryJson { return this.d; }
  /** Metadados conhecidos ou definidos a partir de outra fonte (ex.: cadastro via brapi). */
  setMeta(t: string, m: Meta) { if (!this.d.meta[t]) { this.d.meta[t] = m; this.d.close[t] = new Array(this.d.dates.length).fill(null); this.d.volume[t] = new Array(this.d.dates.length).fill(null); } }
  get dates() { return this.d.dates; }
  has(date: string) { return this.d.dates.includes(date); }
  tickers() { return Object.keys(this.d.meta); }
  meta(t: string): Meta | undefined { return Object.hasOwn(this.d.meta, t) ? this.d.meta[t] : undefined; }

  /** Adiciona um pregão inteiro (substitui se já existir). */
  addSession(date: string, records: CotahistRecord[]) {
    let idx = this.d.dates.indexOf(date);
    if (idx < 0) {
      // insere em ordem
      idx = this.d.dates.findIndex((x) => x > date);
      if (idx < 0) idx = this.d.dates.length;
      this.d.dates.splice(idx, 0, date);
      for (const t of Object.keys(this.d.close)) { this.d.close[t].splice(idx, 0, null); this.d.volume[t].splice(idx, 0, null); }
    }
    for (const r of records) {
      if (r.date !== date) continue;
      const cls = classify(r.bdi, r.name);
      if (!cls) continue;
      if (!this.d.close[r.ticker]) {
        this.d.close[r.ticker] = new Array(this.d.dates.length).fill(null);
        this.d.volume[r.ticker] = new Array(this.d.dates.length).fill(null);
      }
      this.d.close[r.ticker][idx] = round(r.close, 6);
      this.d.volume[r.ticker][idx] = Math.round(r.volume);
      // metadados do pregão mais recente prevalecem
      if (idx === this.d.dates.length - 1 || !this.d.meta[r.ticker]) this.d.meta[r.ticker] = { name: r.name, cls, isin: r.isin, spec: r.spec };
    }
    this.trim();
  }

  /**
   * Fechamentos avulsos (ex.: cotação pessoal via brapi) para ativos JÁ conhecidos por um COTAHIST importado.
   * Retorna os tickers atualizados.
   */
  addQuotes(date: string, quotes: { ticker: string; close: number; volume: number | null }[]): string[] {
    const known = quotes.filter((q) => this.d.meta[q.ticker] && this.d.close[q.ticker]);
    if (!known.length) return [];
    let idx = this.d.dates.indexOf(date);
    if (idx < 0) {
      idx = this.d.dates.findIndex((x) => x > date);
      if (idx < 0) idx = this.d.dates.length;
      this.d.dates.splice(idx, 0, date);
      for (const t of Object.keys(this.d.close)) { this.d.close[t].splice(idx, 0, null); this.d.volume[t].splice(idx, 0, null); }
    }
    for (const q of known) {
      this.d.close[q.ticker][idx] = round(q.close, 6);
      this.d.volume[q.ticker][idx] = q.volume === null ? null : Math.round(q.volume);
    }
    this.trim();
    return known.map((q) => q.ticker);
  }

  protected trim() {
    const extra = this.d.dates.length - this.maxSessions;
    if (extra <= 0) return;
    this.d.dates.splice(0, extra);
    for (const t of Object.keys(this.d.close)) {
      this.d.close[t].splice(0, extra);
      this.d.volume[t].splice(0, extra);
      if (this.d.close[t].every((x) => x === null)) { delete this.d.close[t]; delete this.d.volume[t]; delete this.d.meta[t]; }
    }
  }

  /** Pontos com negócio (pregões sem negociação do ativo são omitidos). */
  points(t: string): DailyPoint[] {
    const c = this.d.close[t];
    if (!c) return [];
    const v = this.d.volume[t];
    const out: DailyPoint[] = [];
    for (let i = 0; i < c.length; i++) if (c[i] !== null) out.push({ date: this.d.dates[i], close: c[i]!, volume: v[i] ?? 0 });
    return out;
  }

}

const round = (n: number, p: number) => Math.round(n * 10 ** p) / 10 ** p;
