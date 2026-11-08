/**
 * Rendimentos de TODOS os FIIs/Fiagros a partir dos avisos estruturados entregues no Fundos.NET,
 * buscados por período de entrega. Mantém o histórico por ticker, deduplicado por data-com
 * (versão mais recente de documento ativo prevalece).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FNET_DOC, FNET_VIEW, parseFnetDividendXml } from '../providers/official';
import { addDays } from '../../src/engine/calendar';

const FNET = 'https://fnet.bmfbovespa.com.br/fnet/publico';
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const FNET_SEARCH_PERIOD = (fromIso: string, toIso: string, start: number, len: number) =>
  `${FNET}/pesquisarGerenciadorDocumentosDados?d=1&s=${start}&l=${len}&o%5B0%5D%5BdataEntrega%5D=asc` +
  `&idCategoriaDocumento=14&idTipoDocumento=41&idEspecieDocumento=0&tipoFundo=1&dataInicial=${br(fromIso)}&dataFinal=${br(toIso)}`;

export interface StoredDividend {
  amount: number; recordDate: string; paymentDate: string; taxExempt?: boolean; docId: number; version: number; deliveredAt: string; cnpj: string;
}
interface Data { coveredFrom: string | null; coveredTo: string | null; byTicker: Record<string, StoredDividend[]>; seenDocs: number[] }

export class DividendStore {
  d: Data = { coveredFrom: null, coveredTo: null, byTicker: {}, seenDocs: [] };
  constructor(private readonly path: string) {
    if (existsSync(path)) { try { const v = JSON.parse(readFileSync(path, 'utf8')); if (v?.byTicker) this.d = v; } catch { /* inicia vazio */ } }
  }
  get(t: string): StoredDividend[] { return Object.hasOwn(this.d.byTicker, t) ? this.d.byTicker[t] : []; }
  upsert(t: string, ev: StoredDividend) {
    const list = (this.d.byTicker[t] ??= []);
    const i = list.findIndex((x) => x.recordDate === ev.recordDate);
    if (i < 0) list.push(ev);
    else if (ev.version > list[i].version || (ev.version === list[i].version && ev.docId > list[i].docId)) list[i] = ev;
    list.sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d));
    renameSync(tmp, this.path);
  }
}

interface ListItem { id: number; dataEntrega: string; status?: string; situacaoDocumento?: string; versao?: number }

/**
 * Busca avisos entregues no período e atualiza o store. Requisições sequenciais com pausa
 * (gentileza com a fonte). Retorna o número de documentos processados.
 */
export async function syncDividends(store: DividendStore, fetchImpl: typeof fetch, fromIso: string, toIso: string, opts: { pauseMs?: number; log?: (m: string) => void } = {}): Promise<number> {
  const pause = opts.pauseMs ?? 250;
  const seen = new Set(store.d.seenDocs);
  let processed = 0;
  // janelas de 7 dias para manter as páginas pequenas
  for (let a = fromIso; a <= toIso; a = addDays(a, 7)) {
    const b = addDays(a, 6) < toIso ? addDays(a, 6) : toIso;
    for (let start = 0; ; start += 100) {
      const res = await fetchImpl(FNET_SEARCH_PERIOD(a, b, start, 100), { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Fundos.NET respondeu HTTP ${res.status}`);
      const page = (await res.json()) as { data?: ListItem[]; recordsFiltered?: number };
      const docs = (page.data ?? []).filter((d) => (d.status ?? 'AC') === 'AC' && (d.situacaoDocumento ?? 'A') === 'A');
      for (const doc of docs) {
        if (seen.has(doc.id)) continue;
        await new Promise((r) => setTimeout(r, pause));
        const x = await fetchImpl(FNET_DOC(doc.id));
        if (!x.ok) continue;
        const parsed = parseFnetDividendXml(await x.text());
        const [dd, mm, yyyy] = doc.dataEntrega.slice(0, 10).split('/');
        for (const dv of parsed.dividends) {
          if (!/^[A-Z0-9]{4,6}1[1-9]$/.test(dv.ticker) || !dv.recordDate || !dv.paymentDate) continue;
          store.upsert(dv.ticker, {
            amount: Number(dv.amount), recordDate: dv.recordDate, paymentDate: dv.paymentDate, taxExempt: dv.taxExempt,
            docId: doc.id, version: doc.versao ?? 1, deliveredAt: `${yyyy}-${mm}-${dd}`, cnpj: parsed.cnpj,
          });
        }
        seen.add(doc.id);
        processed++;
      }
      if (start + 100 >= (page.recordsFiltered ?? 0) || !(page.data ?? []).length) break;
    }
    // a cobertura só avança quando o intervalo fica contínuo (retroativo interrompido não conta)
    if (!store.d.coveredFrom) store.d.coveredFrom = fromIso;
    else if (fromIso < store.d.coveredFrom && b >= addDays(store.d.coveredFrom, -1)) store.d.coveredFrom = fromIso;
    if (!store.d.coveredTo || b > store.d.coveredTo) store.d.coveredTo = b;
    store.d.seenDocs = [...seen].slice(-20000);
    store.save(); // progresso salvo a cada semana processada (retomável)
    opts.log?.(`Fundos.NET: ${a} a ${b} — ${processed} documentos`);
  }
  return processed;
}

export const docLink = (id: number) => FNET_VIEW(id);
