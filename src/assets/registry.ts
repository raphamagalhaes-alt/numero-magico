/**
 * Registro de ativos. Para adicionar um FII, inclua ticker, CNPJ e ISIN — conferidos na base
 * aberta da CVM (inf_mensal_fii) e no arquivo COTAHIST da B3 — e o motor, a API e a interface
 * passam a suportá-lo automaticamente. Dados de mercado vêm sempre das fontes oficiais.
 */
export type AssetClass = 'FII' | 'ACAO' | 'ETF';

export interface AssetDefinition {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** CNPJ do fundo/classe, somente dígitos (fonte: CVM Dados Abertos). */
  cnpj: string;
  isin: string;
  administrator: string;
  /** Prazo típico entre data-com e pagamento, observado nos avisos oficiais (dias úteis). */
  paymentLagBusinessDays: number;
  /** Valores do exemplo didático original (NÃO são cotações). Só existe para o MXRF11. */
  demo?: {
    price: string;
    dividend: string;
    desiredShares: number;
    inflationAnnual: string;
    monthlyContribution: string;
    months: number;
  };
}

export const ASSETS: Record<string, AssetDefinition> = {
  MXRF11: {
    ticker: 'MXRF11', name: 'Maxi Renda FII', assetClass: 'FII',
    cnpj: '97521225000125', isin: 'BRMXRFCTF008', administrator: 'BTG Pactual Serviços Financeiros S.A. DTVM',
    paymentLagBusinessDays: 10,
    demo: { price: '8.89', dividend: '0.10', desiredShares: 2, inflationAnnual: '0.06', monthlyContribution: '250', months: 360 },
  },
  HGLG11: {
    ticker: 'HGLG11', name: 'Pátria Log FII', assetClass: 'FII',
    cnpj: '11728688000147', isin: 'BRHGLGCTF004', administrator: 'Banco Genial S.A.', paymentLagBusinessDays: 10,
  },
  KNRI11: {
    ticker: 'KNRI11', name: 'Kinea Renda Imobiliária FII', assetClass: 'FII',
    cnpj: '12005956000165', isin: 'BRKNRICTF007', administrator: 'Intrag DTVM Ltda.', paymentLagBusinessDays: 10,
  },
  KNCR11: {
    ticker: 'KNCR11', name: 'Kinea Rendimentos Imobiliários FII', assetClass: 'FII',
    cnpj: '16706958000132', isin: 'BRKNCRCTF000', administrator: 'Intrag DTVM Ltda.', paymentLagBusinessDays: 9,
  },
  VISC11: {
    ticker: 'VISC11', name: 'Vinci Shopping Centers FII', assetClass: 'FII',
    cnpj: '17554274000125', isin: 'BRVISCCTF005', administrator: 'BRL Trust DTVM S.A.', paymentLagBusinessDays: 10,
  },
};

export const DEFAULT_TICKER = 'MXRF11';

export const formatCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/** Links oficiais verificados para conferência manual. */
export function officialSources(a: { ticker: string; cnpj?: string }): { label: string; url: string }[] {
  return [
    ...(a.cnpj ? [{ label: `Fundos.NET — documentos do ${a.ticker}`, url: `https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM?cnpjFundo=${a.cnpj}` }] : []),
    { label: 'CVM — dados abertos de FII', url: 'https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal' },
  ];
}
