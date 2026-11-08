/**
 * Catálogo das principais ações, fundos e ETFs (Brasil e mundo) — somente identificação (código,
 * empresa, setor, região). Não contém preços: as cotações vêm da chave pessoal de cada usuário.
 * Seleção objetiva: maiores empresas/fundos por valor de mercado ou peso em índices amplos e mais
 * negociados — NÃO é recomendação de compra. Empresas estrangeiras aparecem como BDR (negociadas na
 * B3, em reais). Códigos conferidos na lista de ativos disponíveis da brapi em 08/11/2026.
 */
export type Region = 'BR' | 'EUA' | 'EUROPA' | 'ASIA' | 'LATAM' | 'GLOBAL';
export type Kind = 'ACAO' | 'FII' | 'ETF' | 'BDR' | 'INDICE';
export interface CatalogItem { symbol: string; name: string; sector: string; region: Region; kind: Kind; note?: string }

const br = (symbol: string, name: string, sector: string): CatalogItem => ({ symbol, name, sector, region: 'BR', kind: 'ACAO' });
const fii = (symbol: string, name: string, sector: string): CatalogItem => ({ symbol, name, sector, region: 'BR', kind: 'FII' });
const bdr = (symbol: string, name: string, sector: string, region: Region): CatalogItem => ({ symbol, name, sector, region, kind: 'BDR' });
const etf = (symbol: string, name: string, sector: string, region: Region, note?: string): CatalogItem => ({ symbol, name, sector, region, kind: 'ETF', note });

export const INDICES: CatalogItem[] = [
  { symbol: '^BVSP', name: 'Ibovespa', sector: 'Índice da bolsa brasileira', region: 'BR', kind: 'INDICE' },
  { symbol: 'IFIX.SA', name: 'IFIX', sector: 'Índice de fundos imobiliários', region: 'BR', kind: 'INDICE' },
];

export const CATALOG: CatalogItem[] = [
  // Brasil — maiores empresas da B3, por setor
  br('PETR4', 'Petrobras', 'Petróleo e gás'), br('PRIO3', 'PRIO', 'Petróleo e gás'), br('VBBR3', 'Vibra Energia', 'Petróleo e gás'), br('UGPA3', 'Ultrapar', 'Petróleo e gás'), br('CSAN3', 'Cosan', 'Petróleo e gás'), br('BRAV3', 'Brava Energia', 'Petróleo e gás'),
  br('VALE3', 'Vale', 'Mineração e siderurgia'), br('GGBR4', 'Gerdau', 'Mineração e siderurgia'), br('CSNA3', 'CSN', 'Mineração e siderurgia'), br('USIM5', 'Usiminas', 'Mineração e siderurgia'), br('SUZB3', 'Suzano', 'Papel e celulose'), br('KLBN11', 'Klabin', 'Papel e celulose'),
  br('ITUB4', 'Itaú Unibanco', 'Bancos e financeiro'), br('BBDC4', 'Bradesco', 'Bancos e financeiro'), br('BBAS3', 'Banco do Brasil', 'Bancos e financeiro'), br('BPAC11', 'BTG Pactual', 'Bancos e financeiro'), br('SANB11', 'Santander Brasil', 'Bancos e financeiro'), br('ITSA4', 'Itaúsa', 'Bancos e financeiro'), br('B3SA3', 'B3', 'Bancos e financeiro'), br('BBSE3', 'BB Seguridade', 'Bancos e financeiro'), br('CXSE3', 'Caixa Seguridade', 'Bancos e financeiro'), br('PSSA3', 'Porto Seguro', 'Bancos e financeiro'),
  br('AXIA3', 'Axia Energia (ex-Eletrobras)', 'Energia elétrica'), br('EQTL3', 'Equatorial', 'Energia elétrica'), br('CMIG4', 'Cemig', 'Energia elétrica'), br('CPLE3', 'Copel', 'Energia elétrica'), br('EGIE3', 'Engie Brasil', 'Energia elétrica'), br('TAEE11', 'Taesa', 'Energia elétrica'), br('ISAE4', 'ISA Energia', 'Energia elétrica'), br('CPFE3', 'CPFL Energia', 'Energia elétrica'), br('ENEV3', 'Eneva', 'Energia elétrica'),
  br('SBSP3', 'Sabesp', 'Saneamento'),
  br('ABEV3', 'Ambev', 'Consumo e varejo'), br('LREN3', 'Lojas Renner', 'Consumo e varejo'), br('ASAI3', 'Assaí', 'Consumo e varejo'), br('MGLU3', 'Magazine Luiza', 'Consumo e varejo'), br('NATU3', 'Natura', 'Consumo e varejo'), br('AZZA3', 'Azzas 2154', 'Consumo e varejo'), br('MBRF3', 'MBRF (Marfrig + BRF)', 'Consumo e varejo'),
  br('RDOR3', 'Rede D’Or', 'Saúde'), br('RADL3', 'Raia Drogasil', 'Saúde'), br('HYPE3', 'Hypera', 'Saúde'),
  br('WEGE3', 'WEG', 'Indústria e transporte'), br('EMBJ3', 'Embraer', 'Indústria e transporte'), br('RENT3', 'Localiza', 'Indústria e transporte'), br('RAIL3', 'Rumo', 'Indústria e transporte'), br('MOTV3', 'Motiva (ex-CCR)', 'Indústria e transporte'),
  br('VIVT3', 'Vivo (Telefônica)', 'Telecom e tecnologia'), br('TIMS3', 'TIM', 'Telecom e tecnologia'), br('TOTS3', 'Totvs', 'Telecom e tecnologia'),
  br('MULT3', 'Multiplan', 'Imóveis e construção'), br('CYRE3', 'Cyrela', 'Imóveis e construção'), br('ALOS3', 'Allos', 'Imóveis e construção'),
  br('SLCE3', 'SLC Agrícola', 'Agronegócio'), br('SMTO3', 'São Martinho', 'Agronegócio'),
  // Fundos imobiliários (FIIs) — grandes e muito negociados
  fii('MXRF11', 'Maxi Renda', 'Papel (recebíveis)'), fii('KNCR11', 'Kinea Rendimentos', 'Papel (recebíveis)'), fii('KNIP11', 'Kinea Índices de Preços', 'Papel (recebíveis)'), fii('CPTS11', 'Capitânia Securities', 'Papel (recebíveis)'), fii('VGHF11', 'Valora Hedge Fund', 'Papel (recebíveis)'),
  fii('HGLG11', 'Pátria Log', 'Galpões logísticos'), fii('BTLG11', 'BTG Logística', 'Galpões logísticos'), fii('XPLG11', 'XP Log', 'Galpões logísticos'),
  fii('XPML11', 'XP Malls', 'Shoppings'), fii('VISC11', 'Vinci Shopping Centers', 'Shoppings'),
  fii('KNRI11', 'Kinea Renda Imobiliária', 'Híbrido (lajes e galpões)'), fii('HGRU11', 'Pátria Renda Urbana', 'Renda urbana'),
  // ETFs (cestas de ações) na B3
  etf('BOVA11', 'Ibovespa', 'Ações brasileiras', 'BR'), etf('SMAL11', 'Small caps', 'Ações brasileiras', 'BR'), etf('DIVO11', 'Dividendos', 'Ações brasileiras', 'BR'),
  etf('IVVB11', 'S&P 500 (EUA)', 'Ações dos EUA', 'EUA'), etf('NASD11', 'Nasdaq 100 (EUA)', 'Ações dos EUA', 'EUA'), etf('SPXI11', 'S&P 500 (EUA)', 'Ações dos EUA', 'EUA'),
  etf('ACWI11', 'Ações do mundo todo', 'Mundo', 'GLOBAL'), etf('WRLD11', 'Ações do mundo todo', 'Mundo', 'GLOBAL'), etf('XINA11', 'China', 'Ásia', 'ASIA'),
  etf('GOLD11', 'Ouro', 'Ouro', 'GLOBAL'), etf('HASH11', 'Criptoativos', 'Cripto', 'GLOBAL', 'Volatilidade muito alta'), etf('BITH11', 'Bitcoin', 'Cripto', 'GLOBAL', 'Volatilidade muito alta'),
  // EUA — maiores empresas (BDRs na B3)
  bdr('AAPL34', 'Apple', 'Tecnologia', 'EUA'), bdr('MSFT34', 'Microsoft', 'Tecnologia', 'EUA'), bdr('NVDC34', 'Nvidia', 'Tecnologia', 'EUA'), bdr('AMZO34', 'Amazon', 'Tecnologia', 'EUA'), bdr('GOGL34', 'Alphabet (Google)', 'Tecnologia', 'EUA'), bdr('M1TA34', 'Meta (Facebook)', 'Tecnologia', 'EUA'), bdr('AVGO34', 'Broadcom', 'Tecnologia', 'EUA'), bdr('ORCL34', 'Oracle', 'Tecnologia', 'EUA'), bdr('A1MD34', 'AMD', 'Tecnologia', 'EUA'), bdr('NFLX34', 'Netflix', 'Tecnologia', 'EUA'), bdr('SSFO34', 'Salesforce', 'Tecnologia', 'EUA'), bdr('ADBE34', 'Adobe', 'Tecnologia', 'EUA'), bdr('P2LT34', 'Palantir', 'Tecnologia', 'EUA'),
  bdr('TSLA34', 'Tesla', 'Automóveis', 'EUA'),
  bdr('BERK34', 'Berkshire Hathaway', 'Financeiro', 'EUA'), bdr('JPMC34', 'JPMorgan', 'Financeiro', 'EUA'), bdr('VISA34', 'Visa', 'Financeiro', 'EUA'), bdr('MSCD34', 'Mastercard', 'Financeiro', 'EUA'), bdr('BOAC34', 'Bank of America', 'Financeiro', 'EUA'), bdr('GSGI34', 'Goldman Sachs', 'Financeiro', 'EUA'), bdr('BLAK34', 'BlackRock', 'Financeiro', 'EUA'),
  bdr('LILY34', 'Eli Lilly', 'Saúde', 'EUA'), bdr('JNJB34', 'Johnson & Johnson', 'Saúde', 'EUA'), bdr('UNHH34', 'UnitedHealth', 'Saúde', 'EUA'), bdr('ABBV34', 'AbbVie', 'Saúde', 'EUA'), bdr('PFIZ34', 'Pfizer', 'Saúde', 'EUA'), bdr('MRCK34', 'Merck', 'Saúde', 'EUA'),
  bdr('WALM34', 'Walmart', 'Consumo', 'EUA'), bdr('COCA34', 'Coca-Cola', 'Consumo', 'EUA'), bdr('PEPB34', 'PepsiCo', 'Consumo', 'EUA'), bdr('PGCO34', 'Procter & Gamble', 'Consumo', 'EUA'), bdr('MCDC34', 'McDonald’s', 'Consumo', 'EUA'), bdr('NIKE34', 'Nike', 'Consumo', 'EUA'), bdr('DISB34', 'Disney', 'Consumo', 'EUA'), bdr('HOME34', 'Home Depot', 'Consumo', 'EUA'),
  bdr('EXXO34', 'ExxonMobil', 'Energia', 'EUA'), bdr('CHVX34', 'Chevron', 'Energia', 'EUA'),
  bdr('CATP34', 'Caterpillar', 'Indústria', 'EUA'), bdr('BOEI34', 'Boeing', 'Indústria', 'EUA'), bdr('U1BE34', 'Uber', 'Tecnologia', 'EUA'),
  // Europa
  bdr('ASML34', 'ASML (Holanda)', 'Tecnologia', 'EUROPA'), bdr('SAPP34', 'SAP (Alemanha)', 'Tecnologia', 'EUROPA'), bdr('N1VO34', 'Novo Nordisk (Dinamarca)', 'Saúde', 'EUROPA'), bdr('A1ZN34', 'AstraZeneca (Reino Unido)', 'Saúde', 'EUROPA'), bdr('G1SK34', 'GSK (Reino Unido)', 'Saúde', 'EUROPA'), bdr('ULEV34', 'Unilever (Reino Unido)', 'Consumo', 'EUROPA'), bdr('DEOP34', 'Diageo (Reino Unido)', 'Consumo', 'EUROPA'), bdr('H1SB34', 'HSBC (Reino Unido)', 'Financeiro', 'EUROPA'), bdr('UBSG34', 'UBS (Suíça)', 'Financeiro', 'EUROPA'), bdr('B1PP34', 'BP (Reino Unido)', 'Energia', 'EUROPA'),
  // Ásia
  bdr('TSMC34', 'TSMC (Taiwan)', 'Tecnologia', 'ASIA'), bdr('SNEC34', 'Sony (Japão)', 'Tecnologia', 'ASIA'), bdr('TMCO34', 'Toyota (Japão)', 'Automóveis', 'ASIA'), bdr('HOND34', 'Honda (Japão)', 'Automóveis', 'ASIA'), bdr('BABA34', 'Alibaba (China)', 'Tecnologia', 'ASIA'), bdr('BIDU34', 'Baidu (China)', 'Tecnologia', 'ASIA'), bdr('JDCO34', 'JD.com (China)', 'Consumo', 'ASIA'), bdr('P1DD34', 'PDD/Temu (China)', 'Consumo', 'ASIA'),
  // América Latina (listadas fora, com BDR)
  bdr('MELI34', 'Mercado Livre', 'Tecnologia', 'LATAM'), bdr('ROXO34', 'Nubank', 'Financeiro', 'LATAM'), bdr('INBR34', 'Inter&Co', 'Financeiro', 'LATAM'), bdr('XPBR31', 'XP Inc.', 'Financeiro', 'LATAM'),
];

export const REGION_LABEL: Record<Region, string> = { BR: 'Brasil', EUA: 'Estados Unidos', EUROPA: 'Europa', ASIA: 'Ásia', LATAM: 'América Latina', GLOBAL: 'Mundo' };
export const KIND_LABEL: Record<Kind, string> = { ACAO: 'Ação', FII: 'Fundo imobiliário', ETF: 'ETF (cesta)', BDR: 'BDR (empresa estrangeira na B3)', INDICE: 'Índice' };

/** Grupos mostrados como abas, em linguagem simples. */
export const GROUPS: { id: string; label: string; filter: (i: CatalogItem) => boolean }[] = [
  { id: 'br', label: 'Brasil', filter: (i) => i.kind === 'ACAO' },
  { id: 'fii', label: 'Imobiliários', filter: (i) => i.kind === 'FII' },
  { id: 'etf', label: 'ETFs', filter: (i) => i.kind === 'ETF' },
  { id: 'eua', label: 'EUA', filter: (i) => i.kind === 'BDR' && i.region === 'EUA' },
  { id: 'mundo', label: 'Europa, Ásia e América Latina', filter: (i) => i.kind === 'BDR' && i.region !== 'EUA' },
];
