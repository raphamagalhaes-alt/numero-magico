import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Toda requisição para fora do próprio site é registrada: o site NUNCA pode falar com a B3. */
function watchNetwork(page: Page) {
  const external: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname)) external.push(u.hostname); });
  return external;
}
const B3 = /b3\.com\.br|bmfbovespa\.com\.br/;
const brapiQuote = (t: string, price: number) => ({ results: [{
  symbol: t, shortName: t, longName: t === 'PETR4' ? 'Exemplo Petro PN' : t, regularMarketPrice: price, regularMarketTime: '2026-11-06T21:07:00.000Z', regularMarketVolume: 1000000,
  historicalDataPrice: Array.from({ length: 40 }, (_, i) => ({ date: Math.floor(new Date(Date.UTC(2026, 8, 1 + i * 1.6, 15)).getTime() / 1000), close: price * (0.9 + i * 0.0025), volume: 900000 })),
}] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mxrf:onboarded', 'true'));
});

test('site: dados abertos funcionam sem cotações e sem falar com a B3', async ({ page }) => {
  const ext = watchNetwork(page);
  await page.goto('./#/juros');
  await expect(page.getByTestId('macro-cards')).toContainText('13,75');
  await expect(page.getByTestId('tesouro-table')).toContainText('Tesouro IPCA+');
  await page.goto('./#/dados');
  await expect(page.getByTestId('web-mode-note')).toContainText('Modo site');
  await expect(page.getByTestId('data-status')).toContainText('Nenhuma cotação ainda');
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
});

test('site: arquivo COTAHIST lido no navegador → explorador, P/VP da CVM e simulador com estimativa', async ({ page }) => {
  const ext = watchNetwork(page);
  await page.goto('./#/dados');
  const txt = readFileSync('server/fixtures/cotahist-multi-2026-11-06.txt', 'latin1');
  await page.getByTestId('import-file').setInputFiles({ name: 'COTAHIST_D06112026.TXT', mimeType: 'text/plain', buffer: Buffer.from(txt, 'latin1') });
  await expect(page.getByTestId('import-quotes')).toContainText('COTAHIST_D06112026.TXT: 1 pregões');
  await page.goto('./#/explorar');
  const row = page.locator('[data-testid=exp-table] tbody tr[data-ticker=MXRF11]');
  await expect(row).toContainText('R$ 9,10');
  await expect(row).toContainText('0,97'); // P/VP = 9,10 / 9,35 (VP da CVM)
  await page.reload(); // persistência no IndexedDB
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=MXRF11]')).toContainText('R$ 9,10');
  await page.goto('./#/simulador?t=MXRF11');
  await page.getByRole('button', { name: 'Dados de mercado' }).click();
  await expect(page.getByTestId('market-panel')).toContainText('ESTIMATIVA');
  await expect(page.getByTestId('market-panel')).toContainText('Rendimento mensal ESTIMADO (CVM)');
  await expect(page.getByTestId('status-badge')).toContainText('rendimento estimado (CVM)');
  await expect(page.getByTestId('in-price')).toHaveValue('9,10');
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
});

test('site: chave brapi pessoal busca histórico e fechamento dos ativos acompanhados', async ({ page }) => {
  const ext = watchNetwork(page);
  const asked: string[] = [];
  await page.route('https://brapi.dev/**', (route) => {
    const u = new URL(route.request().url());
    asked.push(u.pathname + '?' + [...u.searchParams.keys()].join(','));
    const t = u.pathname.split('/').pop()!;
    return route.fulfill({ json: brapiQuote(t, t === 'PETR4' ? 40.5 : 9.1), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('./#/carteira');
  await page.evaluate(() => localStorage.setItem('mxrf:positions', JSON.stringify([{ ticker: 'PETR4', shares: 10 }])));
  await page.goto('./#/dados');
  await page.getByTestId('pq-token').fill('minha-chave-pessoal-123');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByTestId('pq-status')).toContainText('Chave configurada (…-123)');
  await expect.poll(() => asked.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(asked[0]).toMatch(/^\/api\/quote\/PETR4\?token,range,interval$/);
  await page.goto('./#/explorar');
  await page.getByRole('button', { name: /^Todos/ }).click();
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=PETR4]')).toContainText('R$ 40,50');
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
  expect(ext.every((h) => h === 'brapi.dev')).toBe(true); // só a sua chave brapi; nada mais sai do aparelho
});
