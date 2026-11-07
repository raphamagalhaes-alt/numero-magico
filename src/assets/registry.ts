/**
 * Registro de ativos. Para adicionar um novo FII/ação/ETF, inclua uma entrada aqui;
 * o motor de simulação é agnóstico ao ativo.
 */
export type AssetClass = 'FII' | 'ACAO' | 'ETF';

export interface AssetDefinition {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Valores do exemplo didático original (NÃO são cotações de mercado). */
  demo: {
    price: string;
    dividend: string;
    desiredShares: number;
    inflationAnnual: string;
    monthlyContribution: string;
    months: number;
  };
  /** Referências oficiais onde os dados de mercado devem ser conferidos. */
  officialSources: { label: string; url: string }[];
}

export const ASSETS: Record<string, AssetDefinition> = {
  MXRF11: {
    ticker: 'MXRF11',
    name: 'Maxi Renda FII',
    assetClass: 'FII',
    demo: {
      price: '8.89',
      dividend: '0.10',
      desiredShares: 2,
      inflationAnnual: '0.06',
      monthlyContribution: '250',
      months: 360,
    },
    officialSources: [
      { label: 'Fundos.NET (CVM/B3) — informes e avisos de rendimentos', url: 'https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM' },
      { label: 'B3 — Fundos listados', url: 'https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/fundos-de-investimentos/fii/fiis-listados/' },
      { label: 'XP Asset — página do fundo (gestora)', url: 'https://www.xpasset.com.br/' },
    ],
  },
};

export const DEFAULT_TICKER = 'MXRF11';
