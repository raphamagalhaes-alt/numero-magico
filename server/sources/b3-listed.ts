/**
 * Proventos em dinheiro de ações (dividendos, JCP, rendimentos) — dados estruturados por evento das
 * páginas de Empresas Listadas da B3: valor por ação, data-com (último dia "com"), pagamento, tipo e
 * classe (ISIN). Termos de Uso da B3: uso exclusivamente pessoal; publicação/redistribuição exige
 * autorização prévia e por escrito. Uma requisição por emissor, sequencial e com pausa.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { brDate, brNumber } from './csv';

export const B3_LISTED_URL = (issuer: string) =>
  `https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/${Buffer.from(JSON.stringify({ issuingCompany: issuer, language: 'pt-br' })).toString('base64')}`;

export type CashKind = 'DIVIDENDO' | 'JCP' | 'RENDIMENTO' | 'OUTRO';
export interface CashEvent { isin: string; amount: number; recordDate: string; paymentDate: string | null; approvedOn: string | null; kind: CashKind; relatedTo: string }

const kindOf = (label: string): CashKind => (/JRS|JUROS/i.test(label) ? 'JCP' : /DIVIDEND/i.test(label) ? 'DIVIDENDO' : /RENDIMENT/i.test(label) ? 'RENDIMENTO' : 'OUTRO');
const date = (s: unknown) => { const d = brDate(String(s ?? '').trim()); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; };

export function parseListedCash(json: unknown): CashEvent[] {
  // com "Accept: application/json" a B3 responde o JSON codificado duas vezes (uma string JSON)
  let v = json;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) { try { v = JSON.parse(v); } catch { return []; } }
  const root = Array.isArray(v) ? v[0] : null;
  const list = root && Array.isArray(root.cashDividends) ? root.cashDividends : [];
  const out: CashEvent[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const amount = brNumber(String(r.rate ?? ''));
    const recordDate = date(r.lastDatePrior);
    const isin = String(r.isinCode ?? r.assetIssued ?? '').trim();
    if (amount === null || amount <= 0 || !recordDate || !/^BR[A-Z0-9]{10}$/.test(isin)) continue;
    out.push({ isin, amount, recordDate, paymentDate: date(r.paymentDate), approvedOn: date(r.approvedOn), kind: kindOf(String(r.label ?? '')), relatedTo: String(r.relatedTo ?? '') });
  }
  return out;
}

interface Data { updatedAt: string | null; byIsin: Record<string, CashEvent[]> }
export class StockDividendStore {
  d: Data = { updatedAt: null, byIsin: {} };
  constructor(private readonly path: string) {
    if (existsSync(path)) { try { const v = JSON.parse(readFileSync(path, 'utf8')); if (v?.byIsin) this.d = v; } catch { /* vazio */ } }
  }
  get(isin: string): CashEvent[] { return Object.hasOwn(this.d.byIsin, isin) ? this.d.byIsin[isin] : []; }
  set(events: CashEvent[], issuerIsins: string[]) {
    for (const i of issuerIsins) delete this.d.byIsin[i];
    for (const e of events) (this.d.byIsin[e.isin] ??= []).push(e);
    for (const k of new Set(events.map((e) => e.isin))) this.d.byIsin[k].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.d));
    renameSync(this.path + '.tmp', this.path);
  }
}

/** Emissor (4 letras) a partir do ticker de ação: PETR4 → PETR. */
export const issuerOf = (ticker: string) => (/^[A-Z0-9]{4}\d{1,2}$/.test(ticker) ? ticker.slice(0, 4) : null);

export async function syncStockDividends(store: StockDividendStore, fetchImpl: typeof fetch, issuers: { code: string; isins: string[] }[], opts: { pauseMs?: number; log?: (m: string) => void } = {}): Promise<{ ok: number; failed: number; events: number }> {
  let ok = 0, failed = 0, events = 0;
  for (const [i, iss] of issuers.entries()) {
    if (i) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 300));
    try {
      const res = await fetchImpl(B3_LISTED_URL(iss.code));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Error('resposta não é JSON'); }
      const ev = parseListedCash(body).filter((e) => iss.isins.includes(e.isin));
      events += ev.length;
      store.set(ev, iss.isins);
      ok++;
    } catch (e) {
      failed++;
      opts.log?.(`proventos ${iss.code}: ${e instanceof Error ? e.message : e}`);
    }
    if (i % 50 === 49) { store.save(); opts.log?.(`proventos de ações: ${i + 1}/${issuers.length} emissores`); }
  }
  store.d.updatedAt = new Date().toISOString();
  store.save();
  if (!ok && failed) throw new Error(`nenhum emissor atualizado (${failed} falhas)`);
  // nenhum evento em centenas de emissores indica mudança de formato na fonte: falha visível, não "sucesso"
  if (issuers.length >= 20 && events === 0) throw new Error('nenhum provento reconhecido — possível mudança no formato da fonte');
  return { ok, failed, events };
}
