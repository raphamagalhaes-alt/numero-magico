/** Versão dos termos: ao mudar, o aceite é pedido de novo. */
export const TERMS_VERSION: string = '2026-11-08';
export const TERMS_KEY = 'mxrf:termsAccepted';
export const CONTACT_URL = 'https://github.com/raphamagalhaes-alt/numero-magico/issues';

/** Atribuições exigidas (ou recomendadas) pelas licenças/termos de cada fonte. */
export const SOURCES: { name: string; use: string; license: string; url: string }[] = [
  { name: 'CVM — Portal de Dados Abertos', use: 'Cadastro e informe mensal de FIIs (base derivada open-data.json)', license: 'Open Database License (ODbL) v1.0 — atribuição e compartilhamento pela mesma licença da base derivada', url: 'https://dados.cvm.gov.br/' },
  { name: 'Tesouro Transparente', use: 'Preços e taxas do Tesouro Direto', license: 'Open Database License (ODbL) v1.0', url: 'https://www.tesourotransparente.gov.br/' },
  { name: 'Banco Central do Brasil — SGS', use: 'Selic, CDI, IPCA e câmbio', license: 'Dados abertos; fonte citada: "Banco Central do Brasil — SGS"', url: 'https://dadosabertos.bcb.gov.br/' },
  { name: 'Bank for International Settlements (BIS)', use: 'Juros básicos de bancos centrais', license: 'Uso livre com crédito à fonte ("Source: BIS"); sem endosso do BIS', url: 'https://www.bis.org/terms_conditions.htm' },
  { name: 'Federal Reserve Bank of New York', use: 'Effective Federal Funds Rate (EFFR)', license: 'Termos de uso do Fed NY, com atribuição à fonte', url: 'https://www.newyorkfed.org/markets/reference-rates/effr' },
  { name: 'Banco Central Europeu (BCE)', use: 'Taxa de depósito (DFR)', license: 'Reutilização livre com citação "Source: ECB statistics."; valores não alterados', url: 'https://data.ecb.europa.eu/' },
  { name: 'B3 — Cotações Históricas (COTAHIST)', use: 'Somente no seu aparelho: o arquivo é baixado por você no site da B3 e lido localmente', license: 'Termos de Uso da B3: uso exclusivamente pessoal; este site não coleta, armazena nem redistribui dados da B3', url: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/' },
  { name: 'B3/CVM — Fundos.NET (versão instalável)', use: 'Rendimentos anunciados por FIIs, consultados pelo seu próprio computador', license: 'Documentos públicos de divulgação obrigatória; uso pessoal', url: 'https://fnet.bmfbovespa.com.br/' },
  { name: 'brapi.dev (opcional)', use: 'Cotações com a SUA chave pessoal, consultadas direto do seu aparelho', license: 'Termos da brapi: licença pessoal e intransferível — não compartilhe sua chave', url: 'https://brapi.dev/' },
];

/** Apaga tudo o que o app guardou neste aparelho (preferências, carteira, chave da brapi, cotações importadas). */
export async function eraseLocalData(): Promise<void> {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith('mxrf:')) window.localStorage.removeItem(k);
  } catch { /* ignore */ }
  try {
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('numero-magico'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  } catch { /* ignore */ }
  try { if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignore */ }
}
