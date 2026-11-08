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
  await expect(page.getByTestId('quotes-howto')).toContainText('Jeito fácil');
  // sem cotações, o Explorar explica o que fazer em vez de mostrar "0 resultados"
  await page.goto('./#/explorar');
  await expect(page.getByTestId('no-quotes')).toBeVisible();
  await page.getByTestId('go-quotes').click();
  await expect(page.getByTestId('quotes-howto')).toBeVisible();
  // no celular o menu fica na barra inferior
  const vw = page.viewportSize()?.width ?? 1280;
  await expect(page.getByTestId('bottom-nav')).toBeVisible({ visible: vw < 640 });
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
    asked.push(u.pathname + '?' + [...u.searchParams.keys()].join(',') + (route.request().headers()['authorization'] === 'Bearer minha-chave-pessoal-123' ? ' +auth' : ''));
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
  expect(asked[0]).toMatch(/^\/api\/quote\/PETR4\?range,interval \+auth$/);
  await page.goto('./#/explorar');
  await page.getByRole('button', { name: /^Todos/ }).click();
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=PETR4]')).toContainText('R$ 40,50');
  // Aporte do mês: 10 cotas a R$ 40,50 + R$ 500 → compra 12 cotas inteiras (R$ 486,00), sobra R$ 14,00
  await page.goto('./#/carteira');
  await expect(page.locator('[data-testid=pf-contrib] tr[data-ticker=PETR4]')).toContainText('12 cotas');
  await expect(page.getByTestId('ap-summary')).toContainText('R$ 486,00');
  await expect(page.getByTestId('ap-summary')).toContainText('R$ 14,00');
  // Liberdade usa a renda e o patrimônio da carteira
  await page.goto('./#/liberdade');
  await expect(page.getByTestId('fr-index')).toBeVisible();
  await expect(page.getByText('patrimônio R$ 405,00')).toBeVisible();
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
  expect(ext.every((h) => h === 'brapi.dev')).toBe(true); // só a sua chave brapi; nada mais sai do aparelho
});

test('site: Mercados mostra principais ações do Brasil e do mundo, com alta/queda, usando só a chave do usuário', async ({ page }) => {
  const ext = watchNetwork(page);
  const auth: (string | undefined)[] = [];
  await page.route('https://brapi.dev/**', (route) => {
    const t = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
    auth.push(route.request().headers()['authorization']);
    const price = t === '^BVSP' ? 128000 : t === 'PETR4' ? 40.5 : 20;
    const pctDay = t === 'PETR4' ? -1.5 : t === 'VALE3' ? 2.3 : 0.4;
    const j = brapiQuote(t, price);
    Object.assign(j.results[0], { regularMarketChangePercent: pctDay, regularMarketChange: price * pctDay / 100 });
    return route.fulfill({ json: j, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('./#/mercados');
  await expect(page.getByTestId('mk-setup')).toContainText('Google (Gmail)');
  // sem chave: a lista já mostra as empresas, sem preço
  await expect(page.getByTestId('mk-list')).toContainText('Petrobras');
  await page.getByTestId('mk-key').fill('minha-chave-pessoal-123');
  await page.getByTestId('mk-save').click();
  const petr = page.locator('[data-testid=mk-list] li[data-symbol=PETR4]');
  await expect(petr).toContainText('R$ 40,50');
  await expect(petr).toContainText('-1,50%');
  await expect(page.getByTestId('mk-headline')).toContainText('128.000');
  await expect(page.getByTestId('mk-movers')).toContainText('Vale');
  // mundo: EUA via BDR
  await page.getByRole('tab', { name: 'EUA' }).click();
  await expect(page.locator('[data-testid=mk-list] li[data-symbol=AAPL34]')).toContainText('R$ 20,00');
  await page.getByTestId('mk-search').fill('toyota');
  await expect(page.getByTestId('mk-list')).toContainText('TMCO34');
  expect(auth.every((a) => a === 'Bearer minha-chave-pessoal-123')).toBe(true);
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
  expect(ext.every((h) => h === 'brapi.dev')).toBe(true);
});

test('site: Liberdade mostra quais contas a renda já paga, a próxima e a linha do tempo', async ({ page }) => {
  await page.goto('./#/liberdade');
  await expect(page.getByTestId('fr-index')).toContainText('0%');
  await page.getByTestId('fr-extra-income').fill('400');
  await page.getByTestId('fr-rate').fill('6');
  // contas padrão em ordem crescente: Celular 60, Água 90, Internet 120, Luz 200…
  await expect(page.getByTestId('fr-covered')).toContainText('Celular, Água, Internet');
  await expect(page.getByTestId('fr-next')).toContainText('Luz');
  await expect(page.getByTestId('fr-next')).toContainText('R$ 70,00');
  await expect(page.getByTestId('fr-next')).toContainText('R$ 14.000,00'); // 70 × 12 ÷ 6%
  await expect(page.getByTestId('fr-plan')).toContainText('R$ 774.000,00'); // (4.270 − 400 de outras rendas) × 12 ÷ 6%
  await expect(page.getByTestId('fr-timeline').locator('li').first()).toContainText('já paga');
  await expect(page.getByTestId('fr-when')).toContainText('anos');
  // outros investimentos (R$ 15 mil a 6% = R$ 75/mês) passam a pagar a Luz — índice e linha do tempo concordam
  await page.getByTestId('fr-extra-capital').fill('15000');
  await expect(page.getByTestId('fr-covered')).toContainText('Internet, Luz');
  await expect(page.getByTestId('fr-timeline').locator('li').nth(3)).toContainText('já paga');
  await expect(page.getByTestId('fr-timeline').locator('li').nth(4)).not.toContainText('já paga');
  // persiste no aparelho
  await page.reload();
  await expect(page.getByTestId('fr-extra-income')).toHaveValue('400');
});
