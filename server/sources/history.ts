/** Histórico compacto de fechamentos e volumes por ativo (últimos N pregões), persistido em JSON. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AssetClassCode } from '../../src/market/universe';
import { classify, type CotahistRecord } from './cotahist';
import type { DailyPoint } from '../../src/market/metrics';

interface Meta { name: string; cls: AssetClassCode; isin: string; spec: string }
interface Data {
  dates: string[]; // pregões em ordem crescente
  close: Record<string, (number | null)[]>;
  volume: Record<string, (number | null)[]>;
  meta: Record<string, Meta>;
}

export class HistoryStore {
  private d: Data = { dates: [], close: {}, volume: {}, meta: {} };
  constructor(private readonly path: string, private readonly maxSessions = 300) {
    if (existsSync(path)) {
      try {
        const v = JSON.parse(readFileSync(path, 'utf8'));
        if (v && Array.isArray(v.dates)) this.d = v;
      } catch (e) { console.error('[history] arquivo ilegível, iniciando vazio', e instanceof Error ? e.message : e); }
    }
  }
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

  private trim() {
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

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d));
    renameSync(tmp, this.path);
  }
}

const round = (n: number, p: number) => Math.round(n * 10 ** p) / 10 ** p;
