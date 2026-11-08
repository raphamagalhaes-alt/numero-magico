/** Pacote de DADOS ABERTOS publicado pelo site (gerado diariamente; nenhum dado da B3). */
import type { DatasetStatus, GlobalRatesResponse, MacroResponse } from '../market/universe';

export interface OpenFund {
  cnpj: string; isin: string; name: string; segment: string | null; administrator: string | null; refDate: string;
  vpPerShare: number | null; shareholders: number | null;
  /** Estimativas mensais de rendimento por cota (CVM: DY do mês × VP/cota). */
  months: { ref: string; dps: number }[];
}
export interface OpenData {
  builtAt: string;
  funds: OpenFund[];
  macro: MacroResponse | null;
  global: GlobalRatesResponse | null;
  status: DatasetStatus[];
}
