import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const setField = async (page: import('@playwright/test').Page, id: string, v: string) => {
  await page.getByTestId(id).fill(v);
};

test('modo demonstração: número mágico, investimento e 360 linhas', async ({ page }) => {
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
  await expect(page.getByTestId('magic-investment')).toHaveText('R$ 1.582,42');
  await expect(page.getByTestId('status-badge')).toContainText('exemplo original');
  await expect(page.locator('[data-testid=sim-table] tbody tr')).toHaveCount(360);
  const m1 = page.locator('tr[data-month="1"]');
  await expect(m1).toContainText('R$ 17,80');
  await expect(m1).toContainText('R$ 1.600,22');
  await expect(page.getByTestId('disclaimer')).toContainText('Não constitui recomendação de investimento');
});

test('mudança instantânea de parâmetros e status personalizado (caso 2)', async ({ page }) => {
  await setField(page, 'in-price', '8,80');
  await setField(page, 'in-dividend', '0,095');
  await expect(page.getByTestId('magic-shares')).toHaveText('186');
  await expect(page.getByTestId('magic-investment')).toHaveText('R$ 1.636,80');
  await expect(page.getByTestId('status-badge')).toHaveText('Cenário personalizado');
  await expect(page.locator('tr[data-month="1"]')).toContainText('R$ 17,67');
});

test('dividendo zero e parâmetro inválido', async ({ page }) => {
  await setField(page, 'in-dividend', '0');
  await expect(page.getByText('Não existe número mágico finito neste cenário.')).toBeVisible();
  await setField(page, 'in-dividend', '0,10');
  await setField(page, 'in-price', '-1');
  await expect(page.getByText('O preço da cota deve ser maior que zero.')).toBeVisible();
  await page.getByTestId('restore').click();
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
  await expect(page.getByTestId('status-badge')).toContainText('exemplo original');
});

test('aba Aportes: aporte a partir do mês 2, reajuste no mês 13 e meta atingida', async ({ page }) => {
  await page.getByRole('tab', { name: 'Aportes mensais' }).click();
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(page.locator('tr[data-month="1"] td').nth(4)).toHaveText('R$ 0,00'); // mês, data-com, pagamento, cotas, aporte
  await expect(page.locator('tr[data-month="2"]')).toContainText('R$ 250,00');
  await expect(page.locator('tr[data-month="13"]')).toContainText('R$ 265,00');
  await expect(page.getByTestId('goal-banner')).toContainText(/Meta atingida no mês \d+ — \d+ anos? e \d+ m(ês|eses) de simulação\./);
  await expect(page.locator('tr[data-goal]')).toHaveCount(1);
});

test('aba Inflação exibe colunas reais', async ({ page }) => {
  await page.getByRole('tab', { name: 'Inflação' }).click();
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(page.locator('[data-testid=sim-table] thead')).toContainText('Patrimônio real');
});

test('exportação CSV brasileiro', async ({ page }) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  const text = readFileSync((await dl.path())!, 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain('Ano;Mês;Data-com;Pagamento/compra;Cotas iniciais');
  expect(text).toMatch(/\r\n1;1;\d{2}\/\d{2}\/\d{4};\d{2}\/\d{2}\/\d{4};178;0,00;8,89;0,10;17,80;0,00;0,00;0,00;2;0,00;180;0,02;1\.600,20;1\.600,22;/);
  expect(text.split('\r\n').filter((l) => /^\d+;\d+;/.test(l))).toHaveLength(360);
});

test('modo de mercado sem integração: modo manual funcional', async ({ page }) => {
  await page.getByRole('button', { name: 'Dados de mercado' }).click();
  const panel = page.getByTestId('market-panel');
  await expect(panel).toContainText('Modo manual — sem atualização automática');
  await expect(panel).toContainText('Nenhum dado de mercado disponível');
  await panel.getByRole('button', { name: 'Inserir manualmente' }).click();
  await panel.getByLabel('Último preço (R$)').fill('9,50');
  await panel.getByLabel('Data/hora do negócio').fill('2026-11-06T17:00');
  await panel.getByLabel('Fonte da cotação').fill('Fonte de teste');
  await panel.getByLabel('Rendimento por cota (R$)').fill('0,095');
  await panel.getByLabel('Data-com').fill('2026-11-28');
  await panel.getByLabel('Data de pagamento').fill('2026-12-12');
  await panel.getByLabel('Fonte do rendimento').fill('Aviso de teste');
  await panel.getByRole('button', { name: 'Salvar dados manuais' }).click();
  await expect(page.getByTestId('status-badge')).toContainText('Dados de mercado');
  await expect(page.getByTestId('status-badge')).toContainText('rendimento anunciado');
  await expect(page.getByTestId('in-price')).toHaveValue('9,50');
  await expect(page.getByTestId('in-dividend')).toHaveValue('0,095');
  await expect(panel).toContainText('usado na simulação');
  // edição manual muda para personalizado e não é sobrescrita pela atualização
  await setField(page, 'in-price', '9,00');
  await expect(page.getByTestId('status-badge')).toHaveText('Cenário personalizado');
  await panel.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(panel).toContainText('Última atualização falhou');
  await expect(page.getByTestId('in-price')).toHaveValue('9,00');
});

test('persistência local das configurações', async ({ page }) => {
  await setField(page, 'in-desired', '3');
  await expect(page.getByTestId('magic-shares')).toHaveText('267');
  await page.reload();
  await expect(page.getByTestId('magic-shares')).toHaveText('267');
});

test('premissas avançadas: IR, custos e datas reais', async ({ page }) => {
  await page.getByTestId('advanced').locator('summary').click();
  await page.getByTestId('in-startMonth').fill('2026-11');
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(page.locator('tr[data-month="1"]')).toContainText('30/10/2026');
  await expect(page.locator('tr[data-month="1"]')).toContainText('16/11/2026');
  await setField(page, 'in-dividendTaxPct', '15');
  await expect(page.getByTestId('magic-shares')).toHaveText('210');
  await expect(page.locator('[data-testid=sim-table] thead')).toContainText('IR retido');
  await setField(page, 'in-dividendTaxPct', '0');
  await setField(page, 'in-costFixed', '1,00');
  await expect(page.getByTestId('magic-shares')).toHaveText('188');
  await expect(page.locator('[data-testid=sim-table] thead')).toContainText('Custos');
  await setField(page, 'in-costPct', '150');
  await expect(page.getByText('Informe um percentual entre 0% e 99,99%.')).toBeVisible();
});

test('seletor de ativos: outros FIIs só com dados de mercado', async ({ page }) => {
  await page.getByTestId('ticker').selectOption('HGLG11');
  await expect(page.getByRole('button', { name: 'Demonstração' })).toBeDisabled();
  await expect(page.getByTestId('market-panel')).toContainText('Dados de mercado · HGLG11');
  await page.getByTestId('ticker').selectOption('MXRF11');
  await page.getByRole('button', { name: 'Demonstração' }).click();
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
});
