/**
 * Central de dados de mercado: baixa, valida e persiste os conjuntos oficiais, calcula indicadores
 * e registra o estado de cada fonte. Executado pelo agendador (9h e 21h30, America/Sao_Paulo).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { addDays, addMonths, isTradingDay, saoPauloDate } from '../src/engine/calendar';
import { computeMetrics } from '../src/market/analytics';
import type { AssetDetail, AssetMetrics, DatasetStatus, GlobalRatesResponse, MacroResponse, UniverseResponse } from '../src/market/universe';
import { COTAHIST_URL } from './providers/official';
import { parseCotahistAll } from './sources/cotahist';
import { HistoryStore } from './sources/history';
import { pendingImports, readCotahistFile, readImport } from './sources/import';
import { StockDividendStore, issuerOf, syncStockDividends } from './sources/b3-listed';
import { fetchBrapiQuotes } from './sources/brapi';
import { isTradingDay as isSession, saoPauloHour } from '../src/engine/calendar';
import type { CotahistRecord } from './sources/cotahist';
import { fetchCvmFii, type FiiInfo } from './sources/cvm-fii';
import { DividendStore, docLink, syncDividends } from './sources/fnet-all';
import { fetchSgs } from './sources/bcb';
import { parseTesouro, TESOURO_URL } from './sources/tesouro';
import { BIS_URL, ECB_URL, NYFED_URL, mergeRates, parseBis, parseEcb, parseNyFed } from './sources/global-rates';

export const COTAHIST_MONTH_URL = (yyyymm: string) => `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_M${yyyymm.slice(5, 7)}${yyyymm.slice(0, 4)}.ZIP`;

type Key = 'cotacoes' | 'cvm' | 'rendimentos' | 'acoes' | 'macro' | 'global';
const LABELS: Record<Key, string> = {
  cotacoes: 'Cotações B3 (COTAHIST importado)', cvm: 'CVM — informe mensal de FII', rendimentos: 'Fundos.NET — avisos de rendimentos', acoes: 'B3 Empresas Listadas — dividendos e JCP de ações',
  macro: 'Banco Central (SGS) e Tesouro Direto', global: 'Juros de bancos centrais (BIS, Fed NY, BCE)',
};

interface Persisted {
  status: Record<Key, Omit<DatasetStatus, 'key' | 'label' | 'schedule'>>;
  cvm: Record<string, FiiInfo>;
  /** Arquivos COTAHIST já importados (nome → tamanho:mtime). */
  imported?: Record<string, string>;
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
  /**
   * Download automático do COTAHIST. A B3 proíbe coleta automatizada da página de Cotações Históricas;
   * só habilite (B3_MARKET_DATA_AUTHORIZED=1) com autorização/contrato da B3. Padrão: importação manual.
   */
  b3AutomatedDownload?: boolean;
  /** Pasta onde o usuário coloca os arquivos COTAHIST baixados manualmente. */
  importDir?: string;
  /** Cotações pessoais com a chave brapi do próprio usuário, para a lista de acompanhamento. */
  personalQuotes?: () => { token: string | null; tickers: string[] };
}

export class DataHub {
  readonly history: HistoryStore;
  readonly dividends: DividendStore;
  readonly stockDivs: StockDividendStore;
  private p: Persisted;
  private universeCache: UniverseResponse | null = null;
  /** Incrementa a cada mudança de dados (invalida ETags). */
  version = 0;
  private running: Promise<void> | null = null;
  private readonly now: () => Date;
  private readonly log: (m: string) => void;

  constructor(private readonly o: HubOptions) {
    this.now = o.now ?? (() => new Date());
    this.log = o.log ?? ((m) => console.log(`[dados] ${m}`));
    this.history = new HistoryStore(join(o.dir, 'history.json'));
    this.dividends = new DividendStore(join(o.dir, 'dividends.json'));
    const empty = { lastSuccess: null, lastAttempt: null, lastError: null, asOf: null };
    this.p = { status: { cotacoes: { ...empty }, cvm: { ...empty }, rendimentos: { ...empty }, acoes: { ...empty }, macro: { ...empty }, global: { ...empty } }, cvm: {}, macro: null, global: null };
    const f = join(o.dir, 'hub.json');
    if (existsSync(f)) { try { const v = JSON.parse(readFileSync(f, 'utf8')); this.p = { ...this.p, ...v, status: { ...this.p.status, ...(v.status ?? {}) } }; } catch { /* inicia vazio */ } }
    this.stockDivs = new StockDividendStore(join(o.dir, 'stock-dividends.json'));
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
    this.version++;
    this.save();
  }

  /** Atualiza todas as fontes; execuções simultâneas são unificadas. */
  updateAll(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      await this.step('cotacoes', () => this.updateQuotes());
      await this.step('cvm', () => this.updateCvm());
      await this.step('rendimentos', () => this.updateDividends());
      await this.step('acoes', () => this.updateStockDividends());
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

  get importDir() { return this.o.importDir ?? join(this.o.dir, '..', 'import'); }
  get automatedQuotes() { return Boolean(this.o.b3AutomatedDownload); }

  /** Adiciona registros de um arquivo COTAHIST (importação manual ou upload). */
  ingestRecords(recs: CotahistRecord[]): number {
    const byDate = new Map<string, CotahistRecord[]>();
    for (const r of recs) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
    for (const [d, rs] of [...byDate].sort()) this.history.addSession(d, rs);
    this.history.save();
    this.universeCache = null;
    this.version++;
    return byDate.size;
  }

  private importQuotes(): string | null {
    const done = (this.p.imported ??= {});
    const files = pendingImports(this.importDir, done);
    for (const f of files) {
      const n = this.ingestRecords(readCotahistFile(readImport(f.path), f.name));
      done[f.name] = f.key;
      this.log(`cotações: ${f.name} importado (${n} pregões)`);
    }
    if (!this.history.dates.length) throw new Error(`Nenhuma cotação importada. Baixe arquivos COTAHIST no site da B3 e coloque em ${this.importDir} (ou use "Importar" em Status dos dados).`);
    return this.history.dates[this.history.dates.length - 1] ?? null;
  }

  /**
   * Fechamentos do dia pela chave brapi do usuário (somente pregões encerrados), para os ativos acompanhados
   * que já existem no histórico (um COTAHIST importado traz cadastro/ISIN e o histórico de 12 meses).
   */
  private async updatePersonalQuotes(): Promise<string | null> {
    const cfg = this.o.personalQuotes?.();
    if (!cfg?.token || !cfg.tickers.length) return null;
    const known = cfg.tickers.filter((t) => this.history.meta(t));
    if (!known.length) { this.quoteNotes.push('chave brapi configurada, mas nenhum ativo acompanhado está no histórico: importe um COTAHIST (mensal ou anual) uma vez'); return null; }
    const { quotes, errors } = await fetchBrapiQuotes(this.o.fetchImpl, cfg.token, known, { pauseMs: this.o.pauseMs ?? 400, maxRequests: 60 });
    const now = this.now();
    const today = saoPauloDate(now);
    // só fechamentos de pregão encerrado (dia anterior, ou hoje após 18h30 de Brasília)
    const closed = quotes.filter((q) => isSession(q.sessionDate) && (q.sessionDate < today || saoPauloHour(now) >= 19));
    const byDate = new Map<string, typeof closed>();
    for (const q of closed) (byDate.get(q.sessionDate) ?? byDate.set(q.sessionDate, []).get(q.sessionDate)!).push(q);
    let updated = 0;
    for (const [d, qs] of byDate) {
      const done = this.history.addQuotes(d, qs.map((q) => ({ ticker: q.ticker, close: q.price, volume: q.volume === null ? null : q.volume * q.price })));
      for (const t of done) this.quoteSource[t] = { source: 'brapi (chave pessoal do usuário)', date: d };
      updated += done.length;
    }
    if (updated) { this.history.save(); this.universeCache = null; }
    if (errors.length) this.quoteNotes.push(`brapi: ${errors.slice(0, 3).join('; ')}`);
    this.log(`cotações pessoais (brapi): ${updated} fechamentos atualizados`);
    return closed.map((q) => q.sessionDate).sort().pop() ?? null;
  }
  private quoteNotes: string[] = [];
  private quoteSource: Record<string, { source: string; date: string }> = {};
  quoteSourceOf(t: string) { return this.quoteSource[t] ?? null; }

  /** Cotações: importação de arquivos baixados manualmente (padrão) ou download autorizado. */
  private async updateQuotes(): Promise<string | null> {
    this.quoteNotes = [];
    if (!this.o.b3AutomatedDownload) {
      let imported: string | null = null;
      let importErr: unknown = null;
      try { imported = this.importQuotes(); } catch (e) { importErr = e; }
      const personal = await this.updatePersonalQuotes().catch((e) => { this.quoteNotes.push(`brapi: ${e instanceof Error ? e.message : e}`); return null; });
      if (importErr && !personal) throw importErr;
      if (this.quoteNotes.length) this.log(this.quoteNotes.join(' · '));
      return [imported, personal].filter(Boolean).sort().pop() ?? null;
    }
    try { this.importQuotes(); } catch { /* sem arquivos importados: segue com o download autorizado */ }
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

  /** Dividendos/JCP de ações: um pedido por emissor das ações com negócio recente. */
  private async updateStockDividends(): Promise<string | null> {
    const byIssuer = new Map<string, Set<string>>();
    const recent = this.history.dates[Math.max(0, this.history.dates.length - 10)] ?? '';
    for (const t of this.history.tickers()) {
      const m = this.history.meta(t);
      const code = issuerOf(t);
      const pts = this.history.points(t);
      if (!m || m.cls !== 'ACAO' || !code || !pts.length || pts[pts.length - 1].date < recent) continue;
      (byIssuer.get(code) ?? byIssuer.set(code, new Set()).get(code)!).add(m.isin);
    }
    if (!byIssuer.size) throw new Error('sem ações no histórico de cotações (importe arquivos COTAHIST primeiro)');
    const r = await syncStockDividends(this.stockDivs, this.o.fetchImpl, [...byIssuer].map(([code, s]) => ({ code, isins: [...s] })), { pauseMs: this.o.pauseMs ?? 300, log: this.log });
    this.log(`proventos de ações: ${r.ok} emissores atualizados, ${r.events} eventos, ${r.failed} falhas`);
    return saoPauloDate(this.now());
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
    return (Object.keys(LABELS) as Key[]).map((k) => ({
      key: k, label: k === 'cotacoes' && this.o.b3AutomatedDownload ? 'Cotações B3 (COTAHIST, download autorizado)' : LABELS[k],
      schedule: k === 'cotacoes' && !this.o.b3AutomatedDownload ? 'Processa arquivos importados às 9h e 21h30 e a cada upload' : 'Diário às 9h e 21h30 (Brasília)',
      ...this.p.status[k],
    }));
  }
  macro(): MacroResponse | null { return this.p.macro; }
  global(): GlobalRatesResponse | null { return this.p.global; }
  fiiByIsin(isin: string): FiiInfo | undefined { return Object.hasOwn(this.p.cvm, isin) ? this.p.cvm[isin] : undefined; }
  cnpjOf(ticker: string): string | undefined { const m = this.history.meta(ticker); return m ? this.fiiByIsin(m.isin)?.cnpj : undefined; }
  isinOf(ticker: string): string | undefined { return this.history.meta(ticker)?.isin; }

  metrics(ticker: string): AssetMetrics | null {
    const meta = this.history.meta(ticker);
    if (!meta) return null;
    const info = meta.cls === 'FII' || meta.cls === 'FIAGRO' ? this.fiiByIsin(meta.isin) : undefined;
    return computeMetrics(ticker, meta, this.history.points(ticker), {
      today: saoPauloDate(this.now()),
      fii: info ? { cnpj: info.cnpj, vpPerShare: info.vpPerShare, shareholders: info.shareholders, segment: info.segment, administrator: info.administrator, refDate: info.refDate } : null,
      fundDividends: meta.cls === 'FII' || meta.cls === 'FIAGRO' ? this.dividends.get(ticker) : undefined,
      fundCoverageFrom: this.dividends.d.coveredFrom,
      stockDividends: meta.cls === 'ACAO' ? this.stockDivs.get(meta.isin).map((e) => ({ amount: e.amount, recordDate: e.recordDate, paymentDate: e.paymentDate ?? '', kind: e.kind })) : undefined,
    });
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
      dividends: metrics.cls === 'ACAO'
        ? this.stockDivs.get(metrics.isin).map((d) => ({ amount: d.amount, recordDate: d.recordDate, paymentDate: d.paymentDate ?? '', kind: d.kind, source: `B3 — Empresas Listadas (${d.kind === 'JCP' ? 'JCP' : d.kind.toLowerCase()}, ${d.relatedTo || 'sem referência'})` }))
        : this.dividends.get(ticker).map((d) => ({ amount: d.amount, recordDate: d.recordDate, paymentDate: d.paymentDate, taxExempt: d.taxExempt, source: `Fundos.NET — aviso entregue em ${d.deliveredAt}`, sourceUrl: docLink(d.docId) })),
    };
  }
}

export const hubDir = (base: string) => dirname(join(base, 'x'));
