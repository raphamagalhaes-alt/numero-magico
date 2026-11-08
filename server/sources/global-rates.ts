/**
 * Juros básicos de bancos centrais:
 *  - BIS (Banco de Compensações Internacionais) — WS_CBPOL, dezenas de países, fonte oficial agregada;
 *  - Fed de Nova York — EFFR diária e intervalo-alvo do FOMC;
 *  - BCE — taxa da facilidade de depósito (DFR), API oficial.
 */
import type { PolicyRate } from '../../src/market/universe';
import { csvObjects } from './csv';

export const BIS_COUNTRIES: Record<string, string> = {
  US: 'Estados Unidos', XM: 'Zona do Euro', GB: 'Reino Unido', JP: 'Japão', CN: 'China', CA: 'Canadá', CH: 'Suíça',
  AU: 'Austrália', BR: 'Brasil', MX: 'México', CL: 'Chile', CO: 'Colômbia', PE: 'Peru', IN: 'Índia', KR: 'Coreia do Sul',
  ZA: 'África do Sul', TR: 'Turquia', SE: 'Suécia', NO: 'Noruega', NZ: 'Nova Zelândia', ID: 'Indonésia', RU: 'Rússia', SA: 'Arábia Saudita',
};
export const BIS_URL = `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${Object.keys(BIS_COUNTRIES).join('+')}/all?lastNObservations=1&format=csv`;
export const NYFED_URL = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json';
export const ECB_URL = 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=csvdata';

export function parseBis(csv: string): PolicyRate[] {
  return csvObjects(csv).filter((r) => r.REF_AREA && r.OBS_VALUE !== '').map((r) => ({
    country: BIS_COUNTRIES[r.REF_AREA] ?? r.REF_AREA,
    centralBank: r.SOURCE_REF || '',
    rate: Number(r.OBS_VALUE), date: r.TIME_PERIOD,
    source: 'BIS — Central bank policy rates (WS_CBPOL)', sourceUrl: 'https://data.bis.org/topics/CBPOL',
  })).filter((r) => Number.isFinite(r.rate));
}

export function parseNyFed(json: { refRates?: { effectiveDate: string; percentRate: number; targetRateFrom?: number; targetRateTo?: number }[] }): PolicyRate | null {
  const r = json.refRates?.[0];
  if (!r) return null;
  return {
    country: 'Estados Unidos', centralBank: 'Federal Reserve (FOMC)', rate: r.percentRate, date: r.effectiveDate,
    note: r.targetRateFrom !== undefined ? `Intervalo-alvo ${r.targetRateFrom.toFixed(2)}–${r.targetRateTo?.toFixed(2)}% · EFFR` : 'EFFR',
    source: 'Federal Reserve Bank of New York — EFFR', sourceUrl: 'https://www.newyorkfed.org/markets/reference-rates/effr',
  };
}

export function parseEcb(csv: string): PolicyRate | null {
  const r = csvObjects(csv)[0];
  if (!r || !r.OBS_VALUE) return null;
  return {
    country: 'Zona do Euro', centralBank: 'Banco Central Europeu', rate: Number(r.OBS_VALUE), date: r.TIME_PERIOD,
    note: 'Taxa da facilidade de depósito (DFR)', source: 'BCE — Data Portal (FM.D.U2.EUR.4F.KR.DFR.LEV)', sourceUrl: 'https://data.ecb.europa.eu/',
  };
}

/** Combina as fontes; fontes diretas (Fed, BCE) substituem o BIS para os mesmos países. */
export function mergeRates(bis: PolicyRate[], direct: (PolicyRate | null)[]): PolicyRate[] {
  const map = new Map(bis.map((r) => [r.country, r]));
  for (const d of direct) if (d) map.set(d.country, d);
  return [...map.values()].sort((a, b) => b.rate - a.rate);
}
