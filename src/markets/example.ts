/**
 * Carteira EXEMPLO diversificada em 6 classes — estrutura inspirada em carteiras públicas de educadores
 * financeiros (só a composição e os % por classe; nenhum valor pessoal). Dentro de cada classe o peso é
 * igual entre os ativos (% ideal do ativo = % da classe ÷ nº de ativos). NÃO é recomendação.
 * Ativos estrangeiros usam o equivalente negociado na B3 (BDR/ETF), para cotar com a mesma chave.
 */
export type ExampleClass = 'acoes' | 'fiis' | 'tesouro' | 'exterior' | 'etfs' | 'cripto';
export interface ExampleAsset { symbol: string; name: string; original?: string }
export interface ExampleGroup { id: ExampleClass; label: string; pct: number; assets: ExampleAsset[]; note?: string }

export const EXAMPLE: ExampleGroup[] = [
  { id: 'acoes', label: 'Ações Brasil', pct: 25, assets: [
    { symbol: 'BBSE3', name: 'BB Seguridade' }, { symbol: 'SBSP3', name: 'Sabesp' }, { symbol: 'GRND3', name: 'Grendene' }, { symbol: 'BBAS3', name: 'Banco do Brasil' },
    { symbol: 'WEGE3', name: 'WEG' }, { symbol: 'KLBN3', name: 'Klabin' }, { symbol: 'VALE3', name: 'Vale' }, { symbol: 'EGIE3', name: 'Engie Brasil' },
    { symbol: 'LEVE3', name: 'Mahle Metal Leve' }, { symbol: 'ITSA3', name: 'Itaúsa' }, { symbol: 'PRIO3', name: 'PRIO' }, { symbol: 'RADL3', name: 'Raia Drogasil' },
    { symbol: 'TOTS3', name: 'Totvs' }, { symbol: 'VIVA3', name: 'Vivara' }, { symbol: 'EQTL3', name: 'Equatorial' }, { symbol: 'VBBR3', name: 'Vibra Energia' }, { symbol: 'PSSA3', name: 'Porto Seguro' },
  ] },
  { id: 'fiis', label: 'Fundos imobiliários', pct: 25, assets: [
    { symbol: 'GARE11', name: 'Guardian Real Estate' }, { symbol: 'HGLG11', name: 'Pátria Log' }, { symbol: 'KNRI11', name: 'Kinea Renda Imobiliária' }, { symbol: 'VISC11', name: 'Vinci Shopping Centers' },
    { symbol: 'XPLG11', name: 'XP Log' }, { symbol: 'XPML11', name: 'XP Malls' }, { symbol: 'KNCA11', name: 'Kinea Crédito Agro (Fiagro)' }, { symbol: 'MXRF11', name: 'Maxi Renda' },
    { symbol: 'KNCR11', name: 'Kinea Rendimentos' }, { symbol: 'VGIA11', name: 'Valora CRA (Fiagro)' }, { symbol: 'VGHF11', name: 'Valora Hedge Fund' }, { symbol: 'BTLG11', name: 'BTG Logística' }, { symbol: 'KNSC11', name: 'Kinea Securities' },
  ] },
  // Renda+ 2065: o nome leva o ano da aposentadoria; no arquivo do Tesouro o vencimento é o último pagamento (2084)
  { id: 'tesouro', label: 'Tesouro Direto', pct: 25, note: 'Preço e taxa do dia vêm do Tesouro Transparente (dados abertos, sem chave).', assets: [
    { symbol: 'Tesouro Selic|2031', name: 'Tesouro Selic 2031' }, { symbol: 'Tesouro IPCA+|2035', name: 'Tesouro IPCA+ 2035' }, { symbol: 'Tesouro Renda+ Aposentadoria Extra|2084', name: 'Tesouro Renda+ Aposentadoria Extra 2065' },
  ] },
  { id: 'exterior', label: 'Ações exterior', pct: 20, note: 'No exemplo original são ações compradas nos EUA; aqui aparece o BDR equivalente na B3 (em reais).', assets: [
    { symbol: 'MSFT34', name: 'Microsoft', original: 'MSFT' }, { symbol: 'AAPL34', name: 'Apple', original: 'AAPL' }, { symbol: 'ROXO34', name: 'Nubank', original: 'NU' }, { symbol: 'GOGL34', name: 'Alphabet (Google)', original: 'GOOGL' },
    { symbol: 'MSCD34', name: 'Mastercard', original: 'MA' }, { symbol: 'AMZO34', name: 'Amazon', original: 'AMZN' }, { symbol: 'NVDC34', name: 'Nvidia', original: 'NVDA' }, { symbol: 'M1TA34', name: 'Meta', original: 'META' },
    { symbol: 'COCA34', name: 'Coca-Cola', original: 'KO' }, { symbol: 'JNJB34', name: 'Johnson & Johnson', original: 'JNJ' }, { symbol: 'JPMC34', name: 'JPMorgan', original: 'JPM' }, { symbol: 'MCDC34', name: 'McDonald’s', original: 'MCD' },
    { symbol: 'INBR34', name: 'Inter&Co', original: 'INTR' }, { symbol: 'COWC34', name: 'Costco', original: 'COST' }, { symbol: 'DISB34', name: 'Disney', original: 'DIS' },
  ] },
  { id: 'etfs', label: 'ETFs internacionais', pct: 3, note: 'BDRs dos ETFs listados nos EUA.', assets: [
    { symbol: 'BIVB39', name: 'S&P 500 (iShares Core)', original: 'IVV' }, { symbol: 'BTFL39', name: 'Títulos do Tesouro dos EUA de taxa flutuante', original: 'TFLO' },
  ] },
  { id: 'cripto', label: 'Criptomoedas', pct: 2, note: 'Via ETFs de cripto da B3 (não há ETF de BNB na B3). Volatilidade muito alta.', assets: [
    { symbol: 'QBTC11', name: 'Bitcoin (ETF na B3)', original: 'BTC' }, { symbol: 'ETHE11', name: 'Ethereum (ETF na B3)', original: 'ETH' },
  ] },
];

export const exampleTickers = () => EXAMPLE.filter((g) => g.id !== 'tesouro').flatMap((g) => g.assets.map((a) => a.symbol));
