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
export const FNET_SEARCH = (cnpj: string, limit = 6) =>
  `${FNET}/pesquisarGerenciadorDocumentosDados?d=1&s=0&l=${limit}&o%5B0%5D%5BdataEntrega%5D=desc&cnpjFundo=${cnpj}` +
  `&idCategoriaDocumento=14&idTipoDocumento=41&idEspecieDocumento=0&tipoFundo=1`;
export const FNET_DOC = (id: number) => `${FNET}/downloadDocumento?id=${id}`;
export const FNET_VIEW = (id: number) => `${FNET}/exibirDocumento?id=${id}&cvm=true`;
export const FNET_FUND_PAGE = (cnpj: string) => `${FNET}/abrirGerenciadorDocumentosCVM?cnpjFundo=${cnpj}`;

export interface CotahistQuote {
  ticker: string; sessionDate: string; open: string; high: string; low: string; close: string; trades: number; isin: string;
}

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
    return {
      ticker,
      sessionDate: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      open: money(line.slice(56, 69)),
      high: money(line.slice(69, 82)),
      low: money(line.slice(82, 95)),
      close: money(line.slice(108, 121)),
      trades: Number(line.slice(147, 152)),
      isin: line.slice(230, 242),
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
    const r = prov.match(/<Rendimento>[\s\S]*?<\/Rendimento>/)?.[0];
    if (!r) continue;
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

  private async get(url: string, init?: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try { return await this.fetchImpl(url, { ...init, signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
  }

  /** Procura o pregão mais recente com arquivo publicado, voltando dia a dia. */
  async fetchLastTrade(ticker: string): Promise<LastTrade> {
    const today = saoPauloDate(this.now());
    const missing: string[] = [];
    let cur = today;
    for (let i = 0; i <= (this.opts.maxLookbackDays ?? 12); i++, cur = addDays(cur, -1)) {
      if (!isTradingDay(cur)) continue; // fins de semana e feriados conhecidos: sem requisição
      const url = COTAHIST_URL(cur);
      const res = await this.get(url);
      // só aprende um dia sem pregão quando ele tem 2+ dias (a B3 já teria publicado o arquivo)
      if (res.status === 404) { if (cur <= addDays(today, -2) && !isWeekend(cur)) missing.push(cur); continue; }
      if (!res.ok) throw new Error(`B3 COTAHIST respondeu HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const files = unzipSync(buf);
      const txt = Object.values(files)[0];
      if (!txt) throw new Error('Arquivo COTAHIST vazio');
      const q = parseCotahist(strFromU8(txt, true), ticker);
      if (missing.length) this.opts.onMissingSessions?.(missing);
      if (!q) throw new Error(`${ticker} sem negócios no pregão de ${cur} (COTAHIST)`);
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
    const cnpj = this.opts.cnpjByTicker[ticker];
    if (!cnpj) throw new Error(`CNPJ de ${ticker} não cadastrado`);
    const res = await this.get(FNET_SEARCH(cnpj), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fundos.NET respondeu HTTP ${res.status}`);
    const list = (await res.json()) as { data?: { id: number; dataEntrega: string; status?: string }[] };
    const today = saoPauloDate(this.now());
    let paid: DividendEvent | null = null;
    let announced: DividendEvent | null = null;
    let lag: number | undefined;
    let administrator: string | undefined;
    for (const doc of list.data ?? []) {
      const x = await this.get(FNET_DOC(doc.id));
      if (!x.ok) continue;
      const parsed = parseFnetDividendXml(await x.text());
      if (parsed.cnpj && parsed.cnpj !== cnpj) continue; // documento de outro fundo: descarta
      const d = parsed.dividends.find((p) => p.ticker === ticker);
      if (!d || !d.recordDate || !d.paymentDate) continue;
      administrator ??= parsed.administrator;
      const [dd, mm, yyyy] = doc.dataEntrega.slice(0, 10).split('/');
      const ev: DividendEvent = {
        amountPerShare: d.amount, recordDate: d.recordDate, paymentDate: d.paymentDate,
        announcedAt: `${yyyy}-${mm}-${dd}`, taxExempt: d.taxExempt, referencePeriod: d.period,
        source: `Fundos.NET — Aviso aos Cotistas (Rendimentos), entregue em ${doc.dataEntrega}`,
        sourceUrl: FNET_VIEW(doc.id),
      };
      lag ??= businessDaysBetween(d.recordDate, d.paymentDate);
      const later = (cur: DividendEvent | null) => !cur || d.recordDate > cur.recordDate;
      if (d.paymentDate > today) { if (later(announced)) announced = ev; }
      else if (later(paid)) paid = ev;
      if (paid !== null) break; // docs vêm do mais recente para o mais antigo
    }
    return { paid, announced, lag, administrator };
  }

  async fetchSnapshot(ticker: string): Promise<MarketSnapshot> {
    const [trade, div] = await Promise.all([this.fetchLastTrade(ticker), this.fetchDividends(ticker)]);
    return {
      ticker, provider: this.name, lastTrade: trade,
      lastPaidDividend: div.paid, lastAnnouncedDividend: div.announced,
      paymentLagBusinessDays: div.lag, administrator: div.administrator,
      fetchedAt: this.now().toISOString(),
    };
  }
}
