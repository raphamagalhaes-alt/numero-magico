/**
 * Provedor OFICIAL e gratuito, sem chave:
 *  - Cotação: arquivo diário de séries históricas da B3 (COTAHIST_DDDMMAAAA.ZIP), publicado
 *    pela própria bolsa para download público. Usa o preço de fechamento (PREULT) do pregão.
 *  - Rendimentos: "Aviso aos Cotistas – Estruturado / Rendimentos e Amortizações" no Fundos.NET
 *    (sistema de documentos regulatórios B3/CVM), documento XML entregue pelo administrador.
 * Não há scraping de HTML: ambos são arquivos de dados públicos e estruturados.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { addDays, businessDaysBetween, isTradingDay, isWeekend, saoPauloDate } from '../../src/engine/calendar';
import type { DividendEvent, LastTrade, MarketSnapshot } from '../../src/market/types';
import type { MarketDataProvider } from './types';

export const COTAHIST_URL = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${d}${m}${y}.ZIP`;
};
const FNET = 'https://fnet.bmfbovespa.com.br/fnet/publico';
const msg = (e: unknown) => (e instanceof Error ? (e.name === 'AbortError' ? 'tempo esgotado' : e.message) : String(e));
export const FNET_SEARCH = (cnpj: string, limit = 12) =>
  `${FNET}/pesquisarGerenciadorDocumentosDados?d=1&s=0&l=${limit}&o%5B0%5D%5BdataEntrega%5D=desc&cnpjFundo=${cnpj}` +
  `&idCategoriaDocumento=14&idTipoDocumento=41&idEspecieDocumento=0&tipoFundo=1`;
export const FNET_DOC = (id: number) => `${FNET}/downloadDocumento?id=${id}`;
export const FNET_VIEW = (id: number) => `${FNET}/exibirDocumento?id=${id}&cvm=true`;
export const FNET_FUND_PAGE = (cnpj: string) => `${FNET}/abrirGerenciadorDocumentosCVM?cnpjFundo=${cnpj}`;

export interface CotahistQuote {
  ticker: string; sessionDate: string; open: string; high: string; low: string; close: string; trades: number; isin: string;
  /** CODBDI (12 = FII) e FATCOT (fator de cotação: preço por lote de N ações). */
  bdi: string; factor: number;
}
const div = (price: string, factor: number) => (factor === 1 ? price : (Number(price) / factor).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));

const money = (raw: string) => {
  const n = raw.trim().replace(/^0+(?=\d)/, '');
  const padded = n.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
};

/** Lê o layout posicional do COTAHIST (registro tipo 01) e devolve a linha do ticker no mercado à vista. */
export function parseCotahist(text: string, ticker: string): CotahistQuote | null {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('01')) continue;
    if (line.slice(12, 24).trim() !== ticker) continue;
    if (line.slice(24, 27) !== '010') continue; // TPMERC 010 = mercado à vista
    const d = line.slice(2, 10);
    const factor = Number(line.slice(210, 217)) || 1;
    return {
      ticker,
      sessionDate: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      open: div(money(line.slice(56, 69)), factor),
      high: div(money(line.slice(69, 82)), factor),
      low: div(money(line.slice(82, 95)), factor),
      close: div(money(line.slice(108, 121)), factor),
      trades: Number(line.slice(147, 152)),
      isin: line.slice(230, 242),
      bdi: line.slice(10, 12),
      factor,
    };
  }
  return null;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? '';

export interface ParsedDividend { ticker: string; amount: string; recordDate: string; paymentDate: string; taxExempt: boolean | undefined; period: string }

/** Extrai rendimentos de um XML "Rendimentos e Amortizações" do Fundos.NET, por código de negociação. */
export function parseFnetDividendXml(xml: string): { administrator: string; cnpj: string; dividends: ParsedDividend[] } {
  const out: ParsedDividend[] = [];
  for (const prov of xml.match(/<Provento>[\s\S]*?<\/Provento>/g) ?? []) {
    const ticker = tag(prov, 'CodNegociacao');
    // somente blocos <Rendimento>; <Amortizacao> é devolução de capital e fica fora da simulação de renda
    for (const r of prov.match(/<Rendimento>[\s\S]*?<\/Rendimento>/g) ?? []) {
    const amount = tag(r, 'ValorProvento');
    if (!/^\d+(\.\d+)?$/.test(amount)) continue;
    const isento = tag(r, 'RendimentoIsentoIR').toLowerCase();
    out.push({
      ticker, amount,
      recordDate: tag(r, 'DataBase'),
      paymentDate: tag(r, 'DataPagamento'),
      taxExempt: isento === 'sim' ? true : isento === 'não' || isento === 'nao' ? false : undefined,
      period: tag(r, 'PeriodoReferencia'),
    });
    }
  }
  return { administrator: tag(xml, 'NomeAdministrador'), cnpj: tag(xml, 'CNPJFundo'), dividends: out };
}

export interface OfficialProviderOptions {
  /** ticker → CNPJ (somente dígitos) do fundo. */
  cnpjByTicker: Record<string, string>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Chamado com dias úteis passados sem arquivo da B3 (feriados/fechamentos extraordinários). */
  onMissingSessions?: (dates: string[]) => void;
  maxLookbackDays?: number;
  /** ticker → ISIN esperado (confere com o COTAHIST). */
  isinByTicker?: Record<string, string>;
  /**
   * Download automático do COTAHIST (só com autorização da B3). Quando false, o preço vem de
   * localTrade (arquivos importados manualmente pelo usuário).
   */
  automatedQuotes?: boolean;
  localTrade?: (ticker: string) => LastTrade | null;
  /** Resolução dinâmica para ativos fora do cadastro fixo (ex.: qualquer FII do universo). */
  resolve?: (ticker: string) => { cnpj?: string; isin?: string } | undefined;
  retries?: number;
  retryDelayMs?: number;
}

export interface FnetListItem { id: number; dataEntrega: string; status?: string; situacaoDocumento?: string; versao?: number }

/** Mantém apenas documentos ativos (status AC / situação A), descartando inativos (IC), cancelados (CC) etc. */
export function activeDocuments(list: FnetListItem[]): FnetListItem[] {
  return list.filter((d) => (d.status === undefined || d.status === 'AC') && (d.situacaoDocumento === undefined || d.situacaoDocumento === 'A'));
}

export class OfficialB3FnetProvider implements MarketDataProvider {
  readonly name = 'oficial (B3 COTAHIST + Fundos.NET)';
  readonly automatic = true;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  constructor(private readonly opts: OfficialProviderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }
  isConfigured(): boolean { return true; }

  private zipCache = new Map<string, { at: number; text: string | null }>();

  /** GET com timeout e novas tentativas (backoff) em erro de rede ou HTTP 5xx/429. */
  private async get(url: string, init?: RequestInit): Promise<Response> {
    const retries = this.opts.retries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, (this.opts.retryDelayMs ?? 1000) * 2 ** (attempt - 1)));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await this.fetchImpl(url, { ...init, headers: { 'User-Agent': 'mxrf11-numero-magico/2.0 (simulador educativo)', ...(init?.headers ?? {}) }, signal: ctrl.signal });
        if (res.status >= 500 || res.status === 429) { lastErr = new Error(`HTTP ${res.status}`); if (attempt < retries) continue; }
        return res;
      } catch (e) { lastErr = e; }
      finally { clearTimeout(timer); }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Texto do COTAHIST de um pregão (null = arquivo inexistente). Cache de 10 min: um download serve todos os ativos. */
  private async cotahist(date: string): Promise<string | null> {
    const hit = this.zipCache.get(date);
    if (hit && this.now().getTime() - hit.at < 10 * 60 * 1000) return hit.text;
    const res = await this.get(COTAHIST_URL(date));
    if (res.status === 404) { this.zipCache.set(date, { at: this.now().getTime(), text: null }); return null; }
    if (!res.ok) throw new Error(`B3 COTAHIST respondeu HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > 20 * 1024 * 1024) throw new Error('Arquivo COTAHIST maior que o esperado');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 20 * 1024 * 1024) throw new Error('Arquivo COTAHIST maior que o esperado');
    const files = unzipSync(buf, { filter: (f) => f.originalSize < 200 * 1024 * 1024 });
    const txt = Object.values(files)[0];
    if (!txt) throw new Error('Arquivo COTAHIST vazio');
    const text = strFromU8(txt, true);
    this.zipCache.set(date, { at: this.now().getTime(), text });
    for (const k of this.zipCache.keys()) if (k < addDays(date, -15)) this.zipCache.delete(k);
    return text;
  }

  /** Procura o pregão mais recente com arquivo publicado, voltando dia a dia. */
  async fetchLastTrade(ticker: string): Promise<LastTrade> {
    if (this.opts.automatedQuotes === false) {
      const t = this.opts.localTrade?.(ticker);
      if (!t) throw new Error(`Sem cotação importada para ${ticker}. Importe o arquivo COTAHIST do último pregão (Status dos dados).`);
      return t;
    }
    const today = saoPauloDate(this.now());
    const missing: string[] = [];
    let cur = today;
    for (let i = 0; i <= (this.opts.maxLookbackDays ?? 12); i++, cur = addDays(cur, -1)) {
      if (!isTradingDay(cur)) continue; // fins de semana e feriados conhecidos: sem requisição
      const url = COTAHIST_URL(cur);
      const text = await this.cotahist(cur);
      // candidato a dia sem pregão: dia útil com 2+ dias úteis de idade e sem arquivo (confirmação no servidor)
      if (text === null) { if (businessDaysBetween(cur, today) >= 2 && !isWeekend(cur)) missing.push(cur); continue; }
      if (missing.length) this.opts.onMissingSessions?.(missing);
      const q = parseCotahist(text, ticker);
      if (!q) continue; // ativo sem negócios neste pregão: recua ao anterior
      const expected = this.opts.isinByTicker?.[ticker] ?? this.opts.resolve?.(ticker)?.isin;
      if (expected && q.isin !== expected) throw new Error(`ISIN divergente no COTAHIST para ${ticker}: ${q.isin} (esperado ${expected})`);
      return {
        price: q.close,
        sessionDate: q.sessionDate,
        tradedAt: `${q.sessionDate}T18:00:00-03:00`,
        kind: 'fechamento',
        source: `B3 — Série histórica diária COTAHIST (fechamento do pregão, ${q.trades} negócios)`,
        sourceUrl: url,
      };
    }
    throw new Error('Nenhum arquivo COTAHIST encontrado nos últimos dias.');
  }

  async fetchDividends(ticker: string): Promise<{ paid: DividendEvent | null; announced: DividendEvent | null; lag?: number; administrator?: string }> {
    const cnpj = this.opts.cnpjByTicker[ticker] ?? this.opts.resolve?.(ticker)?.cnpj;
    if (!cnpj) throw new Error(`CNPJ de ${ticker} não cadastrado`);
    const res = await this.get(FNET_SEARCH(cnpj), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fundos.NET respondeu HTTP ${res.status}`);
    const list = (await res.json()) as { data?: FnetListItem[] };
    const docs = activeDocuments(list.data ?? []);
    const today = saoPauloDate(this.now());
    let paid: DividendEvent | null = null;
    let announced: DividendEvent | null = null;
    let lag: number | undefined;
    let administrator: string | undefined;
    const seen = new Map<string, number>(); // data-com → maior versão já processada
    for (const doc of docs) {
      const x = await this.get(FNET_DOC(doc.id));
      if (!x.ok) continue;
      const parsed = parseFnetDividendXml(await x.text());
      if (parsed.cnpj && parsed.cnpj !== cnpj) continue; // documento de outro fundo: descarta
      const d = parsed.dividends.find((p) => p.ticker === ticker);
      if (!d || !d.recordDate || !d.paymentDate) continue;
      const v = doc.versao ?? 1;
      if ((seen.get(d.recordDate) ?? 0) >= v) continue; // retificação: vale a maior versão por data-com
      seen.set(d.recordDate, v);
      administrator ??= parsed.administrator;
      const [dd, mm, yyyy] = doc.dataEntrega.slice(0, 10).split('/');
      const ev: DividendEvent = {
        amountPerShare: d.amount, recordDate: d.recordDate, paymentDate: d.paymentDate,
        announcedAt: `${yyyy}-${mm}-${dd}`, taxExempt: d.taxExempt, referencePeriod: d.period,
        source: `Fundos.NET — Aviso aos Cotistas (Rendimentos), entregue em ${doc.dataEntrega}`,
        sourceUrl: FNET_VIEW(doc.id),
      };
      lag ??= businessDaysBetween(d.recordDate, d.paymentDate);
      const later = (cur: DividendEvent | null) => !cur || d.recordDate >= cur.recordDate;
      if (d.paymentDate > today) { if (later(announced)) announced = ev; }
      else if (later(paid)) paid = ev;
      if (paid !== null) break; // docs vêm do mais recente para o mais antigo
    }
    return { paid, announced, lag, administrator };
  }

  async fetchSnapshot(ticker: string): Promise<MarketSnapshot> {
    // fontes independentes: a falha de uma não descarta a outra (o serviço completa com o último dado válido)
    const [t, d] = await Promise.allSettled([this.fetchLastTrade(ticker), this.fetchDividends(ticker)]);
    if (t.status === 'rejected' && d.status === 'rejected') throw new Error(`B3: ${msg(t.reason)} · Fundos.NET: ${msg(d.reason)}`);
    const errors: string[] = [];
    if (t.status === 'rejected') errors.push(`cotação (B3): ${msg(t.reason)}`);
    if (d.status === 'rejected') errors.push(`rendimentos (Fundos.NET): ${msg(d.reason)}`);
    const div = d.status === 'fulfilled' ? d.value : null;
    return {
      ticker, provider: this.name, lastTrade: t.status === 'fulfilled' ? t.value : null,
      lastPaidDividend: div?.paid ?? null, lastAnnouncedDividend: div?.announced ?? null,
      paymentLagBusinessDays: div?.lag, administrator: div?.administrator,
      fetchedAt: this.now().toISOString(),
      ...(errors.length ? { partialErrors: errors, partial: { trade: t.status === 'fulfilled', dividends: d.status === 'fulfilled' } } : {}),
    };
  }
}
