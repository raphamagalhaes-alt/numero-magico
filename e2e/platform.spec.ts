import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('explorar: filtra FIIs por DY, abre o simulador do ativo e seleciona para comparar', async ({ page }) => {
  await page.goto('/#/explorar');
  await expect(page.getByTestId('universe-meta')).toContainText('último pregão 06/11/2026');
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=MXRF11]')).toBeVisible();
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=PETR4]')).toHaveCount(0); // aba FIIs
  await page.getByTestId('exp-mindy').fill('30');
  await expect(page.getByTestId('exp-count')).toHaveText('0 resultados');
  await page.getByTestId('exp-mindy').fill('');
  await page.getByRole('button', { name: /^Ações/ }).click();
  await expect(page.locator('[data-testid=exp-table] tbody tr[data-ticker=PETR4]')).toBeVisible();
  await page.getByLabel('Comparar PETR4').check();
  await page.getByRole('button', { name: /^Todos/ }).click();
  await page.getByLabel('Comparar MXRF11').check();
  await page.getByRole('button', { name: /Comparar selecionados \(2\/4\)/ }).click();
  await expect(page.getByTestId('cmp-table')).toContainText('PETR4');
  await expect(page.getByTestId('cmp-table')).toContainText('MXRF11');
  await expect(page.getByTestId('cmp-table')).toContainText('P/VP (CVM)');
});

test('explorar → simular qualquer FII com dados oficiais', async ({ page }) => {
  await page.goto('/#/explorar');
  await page.getByRole('button', { name: 'Simular HGLG11' }).click();
  await expect(page).toHaveURL(/#\/simulador\?t=HGLG11/);
  await expect(page.getByTestId('ticker')).toHaveValue('HGLG11');
});

test('juros e renda fixa: indicadores BCB, Tesouro e bancos centrais', async ({ page }) => {
  await page.goto('/#/juros');
  await expect(page.getByTestId('macro-cards')).toContainText('13,75');
  await expect(page.getByTestId('macro-cards')).toContainText('13,65');
  await expect(page.getByTestId('tesouro-table')).toContainText('Tesouro IPCA+');
  await expect(page.getByTestId('global-table')).toContainText('Estados Unidos');
  await expect(page.getByTestId('global-table')).toContainText('3,88');
  await expect(page.getByTestId('global-table')).toContainText('Zona do Euro');
});

test('status dos dados mostra todas as fontes', async ({ page }) => {
  await page.goto('/#/dados');
  await expect(page.getByTestId('data-status')).toContainText('Cotações B3');
  await expect(page.getByTestId('data-status')).toContainText('Fundos.NET');
  await expect(page.getByTestId('data-status')).toContainText('Banco Central');
  await expect(page.getByTestId('data-status')).toContainText('BIS');
});

test('carteira: progresso até o número mágico e alerta de novo rendimento', async ({ page }) => {
  await page.goto('/#/carteira');
  await page.getByTestId('pf-ticker').fill('MXRF11');
  await page.getByTestId('pf-shares').fill('96');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  const row = page.locator('[data-testid=pf-table] tbody tr').first();
  await expect(row).toContainText('96');
  await expect(row).toContainText('96 cotas'); // número mágico 1 cota/mês: teto(9,10/0,095)=96 (preço sintético)
  await expect(row).toContainText('atingido');
  await expect(page.getByTestId('pf-alerts')).toContainText('MXRF11');
  await page.getByRole('button', { name: 'Marcar como visto' }).click();
  await expect(page.getByTestId('pf-alerts')).toHaveCount(0);
});

test('onboarding em 3 perguntas personaliza a simulação', async ({ page }) => {
  await page.goto('/?onboarding=1#/simulador');
  await page.getByTestId('ob-goal').fill('2.000');
  await page.getByTestId('ob-contrib').fill('500');
  await page.getByTestId('ob-go').click();
  await expect(page.getByRole('tab', { name: 'Aportes mensais' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('in-goal')).toHaveValue('2.000');
  await expect(page.getByTestId('in-contribution')).toHaveValue('500');
});

test('simulador: renda fixa, estresse, Monte Carlo, cenários salvos e marca no PDF', async ({ page }) => {
  await page.goto('/#/simulador');
  await expect(page.getByTestId('fixed-income')).toContainText('CDB 100% do CDI');
  await expect(page.getByTestId('fixed-income')).toContainText('Tesouro IPCA+');
  await expect(page.getByTestId('stress')).toContainText('Corte de 20% no dividendo');
  await expect(page.getByTestId('mc-prob')).toHaveText(/\d+%/);
  await page.getByTestId('saved-scenarios').locator('summary').click();
  await page.getByTestId('sc-name').fill('Plano A');
  await page.getByTestId('sc-save').click();
  await page.getByTestId('in-price').fill('9,50');
  await expect(page.getByTestId('magic-shares')).not.toHaveText('178');
  await page.getByTestId('sc-load-Plano A').click();
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
  await page.getByTestId('brand-name').fill('Escritório Exemplo');
  await page.reload();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Escritório Exemplo')).toBeVisible();
});

test('regra de custo máximo por ordem reduz custos', async ({ page }) => {
  await page.goto('/#/simulador');
  await page.getByTestId('advanced').locator('summary').click();
  await page.getByTestId('in-costFixed').fill('5,00');
  await page.getByTestId('in-maxCostPct').fill('150');
  await expect(page.getByText('O custo máximo por ordem deve estar entre 0% e 100%.')).toBeVisible();
  await page.getByTestId('in-maxCostPct').fill('0,5');
  await expect(page.getByText('O custo máximo por ordem deve estar entre 0% e 100%.')).toHaveCount(0);
});

test('ações: DY de dividendos + JCP (B3) no explorador e simulação com média mensal de 12 meses', async ({ page }) => {
  await page.goto('/#/explorar');
  await page.getByRole('button', { name: /^Ações/ }).click();
  const row = page.locator('[data-testid=exp-table] tbody tr[data-ticker=PETR4]');
  await expect(row).toContainText('5,9%'); // (0,90+0,60+0,90)/40,50
  await row.getByRole('button', { name: 'Simular PETR4' }).click();
  await expect(page.getByTestId('ticker')).toHaveValue('PETR4');
  await expect(page.getByTestId('status-badge')).toContainText('PETR4');
  await expect(page.getByTestId('in-dividend')).toHaveValue('0,20'); // 2,40/12
  await expect(page.getByTestId('market-panel')).toContainText('média mensal de 3 proventos');
});

test('status dos dados: aviso dos termos da B3 e importação manual de COTAHIST', async ({ page }) => {
  await page.goto('/#/dados');
  await expect(page.getByTestId('import-quotes')).toContainText('proíbe a coleta automatizada');
  const fs = await import('node:fs');
  const txt = fs.readFileSync('server/fixtures/cotahist-multi-2026-11-06.txt', 'latin1').replace(/20261106/g, '20261030');
  await page.getByTestId('import-file').setInputFiles({ name: 'COTAHIST_D30102026.TXT', mimeType: 'text/plain', buffer: Buffer.from(txt, 'latin1') });
  await expect(page.getByTestId('import-quotes')).toContainText('COTAHIST_D30102026.TXT: 1 pregões');
  await page.getByTestId('import-file').setInputFiles({ name: 'planilha.zip', mimeType: 'application/zip', buffer: Buffer.from('x') });
  await expect(page.getByTestId('import-quotes')).toContainText('Nome de arquivo inválido');
});

test('carteira: canais de alerta gratuitos (calendário ICS, RSS)', async ({ page, request }) => {
  await page.goto('/#/carteira');
  await page.getByTestId('pf-ticker').fill('MXRF11');
  await page.getByTestId('pf-shares').fill('10');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByTestId('alert-webcal')).toHaveAttribute('href', /^webcal:\/\/.+\/api\/alerts\/calendar\.ics\?t=MXRF11$/);
  const ics = await request.get('/api/alerts/calendar.ics?t=MXRF11,PETR4');
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('MXRF11: pagamento de R$ 0\\,095'); // vírgula escapada (RFC 5545)
  expect(body).toContain('PETR4: data-com');
  const rss = await request.get('/api/alerts/feed.xml?t=MXRF11');
  expect(await rss.text()).toContain('<rss version="2.0">');
});
