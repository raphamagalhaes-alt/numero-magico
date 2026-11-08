/**
 * CVM Dados Abertos — Informe Mensal de FII (dataset público). Fornece, por fundo/classe:
 * CNPJ, ISIN, segmento, administrador, valor patrimonial por cota e número de cotistas.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { csvObjects, brNumber } from './csv';

export const CVM_FII_URL = (year: number) => `https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${year}.zip`;

export interface FiiInfo {
  cnpj: string; isin: string; name: string; segment: string | null; administrator: string | null;
  refDate: string; vpPerShare: number | null; shareholders: number | null; netAssets: number | null;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Combina "geral" (cadastro) e "complemento" (VP/cota, cotistas), mantendo a referência mais recente por CNPJ. */
export function parseCvmFii(geralCsv: string, complementoCsv: string): Map<string, FiiInfo> {
  const latest = <T extends Record<string, string>>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      const k = digits(r.CNPJ_Fundo_Classe ?? '');
      if (!k) continue;
      const prev = m.get(k);
      const key = (x: T) => `${x.Data_Referencia}|${String(x.Versao ?? '').padStart(4, '0')}`;
      if (!prev || key(r) > key(prev)) m.set(k, r);
    }
    return m;
  };
  const geral = latest(csvObjects(geralCsv, ';'));
  const comp = latest(csvObjects(complementoCsv, ';'));
  const byIsin = new Map<string, FiiInfo>();
  for (const [cnpj, g] of geral) {
    const isin = (g.Codigo_ISIN ?? '').trim();
    if (!/^BR[A-Z0-9]{10}$/.test(isin)) continue;
    const c = comp.get(cnpj);
    byIsin.set(isin, {
      cnpj, isin, name: g.Nome_Fundo_Classe ?? '', segment: g.Segmento_Atuacao || null, administrator: g.Nome_Administrador || null,
      refDate: c?.Data_Referencia ?? g.Data_Referencia ?? '',
      vpPerShare: brNumber(c?.Valor_Patrimonial_Cotas), shareholders: brNumber(c?.Total_Numero_Cotistas), netAssets: brNumber(c?.Patrimonio_Liquido),
    });
  }
  return byIsin;
}

export async function fetchCvmFii(fetchImpl: typeof fetch, year: number): Promise<Map<string, FiiInfo>> {
  const res = await fetchImpl(CVM_FII_URL(year));
  if (!res.ok) throw new Error(`CVM respondeu HTTP ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const pick = (part: string) => {
    const k = Object.keys(files).find((f) => f.includes(part));
    if (!k) throw new Error(`Arquivo ${part} ausente no pacote da CVM`);
    return strFromU8(files[k], true); // latin1
  };
  return parseCvmFii(pick('geral'), pick('complemento'));
}

/** Estimativa mensal de rendimento por cota pelo informe da CVM: DY do mês × VP/cota (dado aberto, ODbL). */
export interface CvmMonthly { ref: string; dps: number; dyMonth: number; vp: number }

export function parseCvmMonthly(complementoCsv: string): Map<string, CvmMonthly[]> {
  const byCnpj = new Map<string, Map<string, { v: string; row: Record<string, string> }>>();
  for (const r of csvObjects(complementoCsv, ';')) {
    const k = digits(r.CNPJ_Fundo_Classe ?? '');
    const ref = (r.Data_Referencia ?? '').slice(0, 7);
    if (!k || !/^\d{4}-\d{2}$/.test(ref)) continue;
    const m = byCnpj.get(k) ?? byCnpj.set(k, new Map()).get(k)!;
    const prev = m.get(ref);
    const v = String(r.Versao ?? '').padStart(4, '0');
    if (!prev || v > prev.v) m.set(ref, { v, row: r });
  }
  const out = new Map<string, CvmMonthly[]>();
  for (const [k, months] of byCnpj) {
    const list: CvmMonthly[] = [];
    for (const [ref, { row }] of months) {
      const dy = brNumber(row.Percentual_Dividend_Yield_Mes);
      const vp = brNumber(row.Valor_Patrimonial_Cotas);
      if (dy === null || vp === null || dy <= 0 || vp <= 0 || dy > 0.2) continue;
      list.push({ ref, dyMonth: dy, vp, dps: Math.round(dy * vp * 1e6) / 1e6 });
    }
    out.set(k, list.sort((a, b) => a.ref.localeCompare(b.ref)));
  }
  return out;
}

export async function fetchCvmPackage(fetchImpl: typeof fetch, year: number): Promise<{ geral: string; complemento: string }> {
  const res = await fetchImpl(CVM_FII_URL(year));
  if (!res.ok) throw new Error(`CVM respondeu HTTP ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const pick = (part: string) => { const k = Object.keys(files).find((f) => f.includes(part)); if (!k) throw new Error(`Arquivo ${part} ausente`); return strFromU8(files[k], true); };
  return { geral: pick('geral'), complemento: pick('complemento') };
}
