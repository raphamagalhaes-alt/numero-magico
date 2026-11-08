/**
 * Central de dados de mercado: baixa, valida e persiste os conjuntos oficiais, calcula indicadores
 * e registra o estado de cada fonte. Executado pelo agendador (9h e 21h30, America/Sao_Paulo).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { addDays, addMonths, isTradingDay, saoPauloDate } from '../src/engine/calendar';
import { averageVolume, annualizedVolatility, dividendYield12m, maxDrawdown, pctChange } from '../src/market/metrics';
import type { AssetDetail, AssetMetrics, DatasetStatus, GlobalRatesResponse, MacroResponse, UniverseResponse } from '../src/market/universe';
import { COTAHIST_URL } from './providers/official';
import { parseCotahistAll } from './sources/cotahist';
import { HistoryStore } from './sources/history';
import { fetchCvmFii, type FiiInfo } from './sources/cvm-fii';
import { DividendStore, docLink, syncDividends } from './sources/fnet-all';
import { fetchSgs } from './sources/bcb';
import { parseTesouro, TESOURO_URL } from './sources/tesouro';
import { BIS_URL, ECB_URL, NYFED_URL, mergeRates, parseBis, parseEcb, parseNyFed } from './sources/global-rates';

export const COTAHIST_MONTH_URL = (yyyymm: string) => `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_M${yyyymm.slice(5, 7)}${yyyymm.slice(0, 4)}.ZIP`;

type Key = 'cotacoes' | 'cvm' | 'rendimentos' | 'macro' | 'global';
const LABELS: Record<Key, string> = {
  cotacoes: 'Cotações B3 (COTAHIST)', cvm: 'CVM — informe mensal de FII', rendimentos: 'Fundos.NET — avisos de rendimentos',
  macro: 'Banco Central (SGS) e Tesouro Direto', global: 'Juros de bancos centrais (BIS, Fed NY, BCE)',
};

interface Persisted {
  status: Record<Key, Omit<DatasetStatus, 'key' | 'label' | 'schedule'>>;
  cvm: Record<string, FiiInfo>;
  macro: MacroResponse | null;
  global: GlobalRatesResponse | null;
}

export interface HubOptions {
  dir: string;
  fetchImpl: typeof fetch;
  now?: () => Date;
  historyMonths?: number;
  dividendBackfillDays?: number;
  log?: (m: string) => void;
  pauseMs?: number;
}

export class DataHub {
  readonly history: HistoryStore;
  readonly dividends: DividendStore;
  private p: Persisted;
  private universeCache: UniverseResponse | null = null;
  private running: Promise<void> | null = null;
  private readonly now: () => Date;
  private readonly log: (m: string) => void;

  constructor(private readonly o: HubOptions) {
    this.now = o.now ?? (() => new Date());
    this.log = o.log ?? ((m) => console.log(`[dados] ${m}`));
    this.history = new HistoryStore(join(o.dir, 'history.json'));
    this.dividends = new DividendStore(join(o.dir, 'dividends.json'));
    const empty = { lastSuccess: null, lastAttempt: null, lastError: null, asOf: null };
    this.p = { status: { cotacoes: { ...empty }, cvm: { ...empty }, rendimentos: { ...empty }, macro: { ...empty }, global: { ...empty } }, cvm: {}, macro: null, global: null };
    const f = join(o.dir, 'hub.json');
    if (existsSync(f)) { try { this.p = { ...this.p, ...JSON.parse(readFileSync(f, 'utf8')) }; } catch { /* inicia vazio */ } }
  }

  private save() {
    mkdirSync(this.o.dir, { recursive: true });
    const f = join(this.o.dir, 'hub.json');
    writeFileSync(f + '.tmp', JSON.stringify(this.p));
    renameSync(f + '.tmp', f);
  }

  private async step(key: Key, fn: () => Promise<string | null>) {
    const st = this.p.status[key];
    st.lastAttempt = this.now().toISOString();
    try {
      const asOf = await fn();
      st.lastSuccess = this.now().toISOString();
      st.lastError = null;
      if (asOf) st.asOf = asOf;
    } catch (e) {
      st.lastError = e instanceof Error ? (e.name === 'AbortError' ? 'tempo esgotado' : e.message) : String(e);
      this.log(`${LABELS[key]}: falha — ${st.lastError} (mantidos os últimos dados válidos)`);
    }
    this.universeCache = null;
    this.save();
  }

  /** Atualiza todas as fontes; execuções simultâneas são unificadas. */
  updateAll(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      await this.step('cotacoes', () => this.updateQuotes());
      await this.step('cvm', () => this.updateCvm());
      await this.step('rendimentos', () => this.updateDividends());
      await this.step('macro', () => this.updateMacro());
      await this.step('global', () => this.updateGlobal());
    })().finally(() => { this.running = null; });
    return this.running;
  }

  private async getZipText(url: string, maxZipBytes: number): Promise<string | null> {
    const res = await this.o.fetchImpl(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`B3 respondeu HTTP ${res.status} em ${url.split('/').pop()}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxZipBytes) throw new Error('Arquivo maior que o esperado');
    const files = unzipSync(buf);
    const first = Object.values(files)[0];
    return first ? strFromU8(first, true) : null;
  }

  /** Carga inicial por arquivos mensais + incremental por arquivos diários. */
  private async updateQuotes(): Promise<string | null> {
    const today = saoPauloDate(this.now());
    const months = this.o.historyMonths ?? 13;
    if (this.history.dates.length < 15) {
      for (let i = months; i >= 1; i--) {
        const ym = addMonths(today.slice(0, 7), -i);
        const text = await this.getZipText(COTAHIST_MONTH_URL(ym), 60 * 1024 * 1024);
        if (!text) continue;
        const recs = parseCotahistAll(text);
        const byDate = new Map<string, typeof recs>();
        for (const r of recs) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
        for (const [d, rs] of [...byDate].sort()) this.history.addSession(d, rs);
        this.history.save();
        this.log(`cotações: mês ${ym} carregado (${byDate.size} pregões)`);
      }
    }
    // incremental: pregões do mês corrente (e eventuais lacunas dos últimos 40 dias)
    const last = this.history.dates[this.history.dates.length - 1];
    const from = last ? addDays(last, 1) : addDays(today, -40);
    for (let d = from < addDays(today, -40) ? addDays(today, -40) : from; d <= today; d = addDays(d, 1)) {
      if (!isTradingDay(d) || this.history.has(d)) continue;
      const text = await this.getZipText(COTAHIST_URL(d), 20 * 1024 * 1024);
      if (!text) continue; // ainda não publicado (pregão em andamento) ou sem pregão
      this.history.addSession(d, parseCotahistAll(text));
      this.log(`cotações: pregão ${d} carregado`);
    }
    this.history.save();
    return this.history.dates[this.history.dates.length - 1] ?? null;
  }

  private async updateCvm(): Promise<string | null> {
    const year = Number(saoPauloDate(this.now()).slice(0, 4));
    const merged = new Map<string, FiiInfo>();
    for (const y of [year - 1, year]) {
      try { for (const [k, v] of await fetchCvmFii(this.o.fetchImpl, y)) { const prev = merged.get(k); if (!prev || v.refDate > prev.refDate) merged.set(k, v); } }
      catch (e) { if (y === year) throw e; }
    }
    if (!merged.size) throw new Error('Nenhum FII no informe da CVM');
    this.p.cvm = Object.fromEntries(merged);
    return [...merged.values()].reduce((m, v) => (v.refDate > m ? v.refDate : m), '');
  }

  private async updateDividends(): Promise<string | null> {
    const today = saoPauloDate(this.now());
    const s = this.dividends.d;
    const back = this.o.dividendBackfillDays ?? 400;
    const start = addDays(today, -back);
    // retroativo pendente (do início desejado até o começo já coberto) e depois o incremental
    if (!s.coveredFrom || s.coveredFrom > start) await syncDividends(this.dividends, this.o.fetchImpl, start, s.coveredTo ?? today, { log: this.log, pauseMs: this.o.pauseMs });
    await syncDividends(this.dividends, this.o.fetchImpl, addDays(s.coveredTo ?? today, -3), today, { log: this.log, pauseMs: this.o.pauseMs });
    return s.coveredTo;
  }

  private async updateMacro(): Promise<string | null> {
    const today = saoPauloDate(this.now());
    const indicators = await fetchSgs(this.o.fetchImpl, today);
    let tesouro = this.p.macro?.tesouro ?? { baseDate: null, bonds: [], source: '', sourceUrl: TESOURO_URL };
    let tesouroError: string | null = null;
    try {
      const res = await this.o.fetchImpl(TESOURO_URL);
      if (!res.ok) throw new Error(`Tesouro respondeu HTTP ${res.status}`);
      const t = parseTesouro(await res.text());
      tesouro = { ...t, source: 'Tesouro Transparente — Preços e taxas do Tesouro Direto', sourceUrl: TESOURO_URL };
    } catch (e) { tesouroError = e instanceof Error ? e.message : String(e); this.log(`Tesouro: ${tesouroError} (mantido o último válido)`); }
    this.p.macro = { indicators, tesouro };
    // falha parcial visível no status (indicadores do BCB já foram atualizados e são salvos)
    if (tesouroError) throw new Error(`Tesouro Direto: ${tesouroError} — indicadores do Banco Central atualizados; títulos mantidos de ${tesouro.baseDate ?? 'nenhuma data'}`);
    return indicators.find((i) => i.key === 'cdi')?.last?.date ?? null;
  }

  private async updateGlobal(): Promise<string | null> {
    const settled = await Promise.allSettled([
      this.o.fetchImpl(BIS_URL).then((r) => { if (!r.ok) throw new Error(`BIS HTTP ${r.status}`); return r.text(); }).then(parseBis),
      this.o.fetchImpl(NYFED_URL).then((r) => { if (!r.ok) throw new Error(`Fed NY HTTP ${r.status}`); return r.json(); }).then(parseNyFed),
      this.o.fetchImpl(ECB_URL).then((r) => { if (!r.ok) throw new Error(`BCE HTTP ${r.status}`); return r.text(); }).then(parseEcb),
    ]);
    const [bis, ny, ecb] = settled;
    if (settled.every((x) => x.status === 'rejected')) throw new Error('todas as fontes de juros globais falharam');
    const prev = this.p.global?.rates ?? [];
    const rates = mergeRates(bis.status === 'fulfilled' ? bis.value : prev.filter((r) => r.source.startsWith('BIS')),
      [ny.status === 'fulfilled' ? ny.value : prev.find((r) => r.source.includes('New York')) ?? null,
       ecb.status === 'fulfilled' ? ecb.value : prev.find((r) => r.source.startsWith('BCE')) ?? null]);
    this.p.global = { rates };
    return rates.reduce((m, r) => (r.date > m ? r.date : m), '');
  }

  // ------------------------------- leitura -------------------------------
  status(): DatasetStatus[] {
    return (Object.keys(LABELS) as Key[]).map((k) => ({ key: k, label: LABELS[k], schedule: 'Diário às 9h e 21h30 (Brasília)', ...this.p.status[k] }));
  }
  macro(): MacroResponse | null { return this.p.macro; }
  global(): GlobalRatesResponse | null { return this.p.global; }
  fiiByIsin(isin: string): FiiInfo | undefined { return Object.hasOwn(this.p.cvm, isin) ? this.p.cvm[isin] : undefined; }
  cnpjOf(ticker: string): string | undefined { const m = this.history.meta(ticker); return m ? this.fiiByIsin(m.isin)?.cnpj : undefined; }
  isinOf(ticker: string): string | undefined { return this.history.meta(ticker)?.isin; }

  metrics(ticker: string): AssetMetrics | null {
    const meta = this.history.meta(ticker);
    if (!meta) return null;
    const pts = this.history.points(ticker);
    const last = pts[pts.length - 1];
    if (!last) return null;
    const m: AssetMetrics = {
      ticker, name: meta.name, cls: meta.cls, isin: meta.isin, spec: meta.spec, close: last.close, sessionDate: last.date,
      chg1d: pctChange(pts, 1), chg1m: pctChange(pts, 21), chg12m: pctChange(pts, 252) ?? (pts.length > 200 ? pctChange(pts, pts.length - 1) : null),
      avgVolume21: averageVolume(pts, 21), vol12m: annualizedVolatility(pts), maxDrawdown12m: maxDrawdown(pts), sessions: pts.length,
    };
    if (meta.cls === 'FII' || meta.cls === 'FIAGRO') {
      const info = this.fiiByIsin(meta.isin);
      const divs = this.dividends.get(ticker);
      const today = saoPauloDate(this.now());
      const lastDiv = divs[divs.length - 1];
      // DY de 12 meses só com cobertura completa de avisos (evita somar poucos pagamentos e subestimar)
      const cov = this.dividends.d.coveredFrom;
      const fullCoverage = Boolean(cov && cov <= addDays(today, -335));
      const dy = fullCoverage ? dividendYield12m(divs, last.close, today) : { dy: null, count: 0 };
      Object.assign(m, {
        cnpj: info?.cnpj, vpPerShare: info?.vpPerShare ?? null,
        // P/VP fora de 0,2–5 indica VP/cota incompatível com a cota negociada (desdobramento/grupamento recente)
        pvp: info?.vpPerShare && last.close / info.vpPerShare >= 0.2 && last.close / info.vpPerShare <= 5 ? last.close / info.vpPerShare : null,
        pvpInconsistent: Boolean(info?.vpPerShare) && !(last.close / info!.vpPerShare! >= 0.2 && last.close / info!.vpPerShare! <= 5),
        shareholders: info?.shareholders ?? null, segment: info?.segment ?? null, administrator: info?.administrator ?? null, cvmRefDate: info?.refDate ?? null,
        lastDividend: lastDiv ? { amount: lastDiv.amount, recordDate: lastDiv.recordDate, paymentDate: lastDiv.paymentDate, announced: lastDiv.paymentDate > today } : null,
        dy12m: dy.dy, dividends12mCount: dy.count, dyAnnualizedLast: lastDiv ? (lastDiv.amount * 12) / last.close : null,
      });
    }
    return m;
  }

  universe(): UniverseResponse {
    if (this.universeCache) return this.universeCache;
    const dates = this.history.dates;
    const lastDate = dates[dates.length - 1] ?? null;
    const minActive = dates[Math.max(0, dates.length - 10)] ?? '';
    const assets = this.history.tickers().map((t) => this.metrics(t)).filter((m): m is AssetMetrics => !!m && m.sessionDate >= minActive);
    this.universeCache = { asOf: lastDate, sessions: dates.length, historyFrom: dates[0] ?? null, dividendsCoverageFrom: this.dividends.d.coveredFrom, assets };
    return this.universeCache;
  }

  detail(ticker: string): AssetDetail | null {
    const metrics = this.metrics(ticker);
    if (!metrics) return null;
    return {
      metrics,
      history: this.history.points(ticker),
      dividends: this.dividends.get(ticker).map((d) => ({ amount: d.amount, recordDate: d.recordDate, paymentDate: d.paymentDate, taxExempt: d.taxExempt, source: `Fundos.NET — aviso entregue em ${d.deliveredAt}`, sourceUrl: docLink(d.docId) })),
    };
  }
}

export const hubDir = (base: string) => dirname(join(base, 'x'));
