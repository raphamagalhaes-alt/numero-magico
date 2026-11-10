import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript((data) => {
    // Seed only once: reload must exercise what the app actually persisted.
    if (sessionStorage.getItem('review-seeded')) return;
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem('review-seeded', '1');
  }, entries);
}
const payday = (reserveHave = '0') => ({ configured: true, salary: '5005,10', rule: { kind: 'dia', day: 1 }, pct: '10', raise: { on: false, step: 1, everyMonths: 6, max: 20, start: '2026-01-01' }, reserveMonths: '6', reserveHave, reserveShare: 1, history: [], lastSalary: '5005,10' });

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) await route.continue();
    else await route.abort();
  });
});

test('review: reserve cents survive recording and reload', async ({ page }) => {
  await seed(page, { 'mxrf:payday': payday() });
  await page.goto('./#/mes');
  await page.getByTestId('mo-markdone').click();
  await expect(page.getByTestId('mo-plan')).toContainText('500,51 de');
  await page.reload();
  await expect(page.getByTestId('mo-plan')).toContainText('500,51 de');
  await expect(page.getByTestId('mo-reserve')).not.toContainText('completa');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mxrf:payday')!).reserveHave)).toBe('500,51');
});

for (const [saved, expected] of [['500.51', '500,51'], ['500.5', '500,50'], ['1.000', '1.000,00']]) {
  test(`review: existing reserve ${saved} is interpreted safely`, async ({ page }) => {
    await seed(page, { 'mxrf:payday': payday(saved) });
    await page.goto('./#/mes');
    await expect(page.getByTestId('mo-plan')).toContainText(`${expected} de`);
  });
}

test('review: editing a child goal preserves cents', async ({ page }) => {
  await seed(page, { 'mxrf:kids': [{ name: 'Ana', birth: '2020-01-01', goal: 'Faculdade', target: 1000.51, atAge: 18, monthly: 10.25, have: 100.75 }] });
  await page.goto('./#/filhos');
  await page.getByRole('button', { name: 'Editar Ana', exact: true }).click();
  await expect(page.getByTestId('kid-target')).toHaveValue('1.000,51');
  await page.getByTestId('kid-save').click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mxrf:kids')!)[0])).toMatchObject({ target: 1000.51, monthly: 10.25, have: 100.75 });
});

test('review: family consent identifies both optional shared amounts', async ({ page }) => {
  await page.goto('./#/liberdade');
  const family = page.getByTestId('family');
  await expect(family).toContainText('sem atualização automática');
  const decode = async () => JSON.parse(Buffer.from((await page.getByTestId('fam-code').innerText()).slice(4), 'base64').toString('utf8'));
  expect(await decode()).not.toHaveProperty('income');
  expect(await decode()).not.toHaveProperty('total');
  await family.getByLabel('Incluir renda mensal e total das despesas mensais em reais').check();
  expect(await decode()).toHaveProperty('income');
  expect(await decode()).toHaveProperty('total');
});

test('review: storm distinguishes missing data from calm markets', async ({ page }) => {
  await page.goto('./#/tempestade');
  await expect(page.getByTestId('st-calm')).toContainText('Sem dados recentes para avaliar');
  await expect(page.getByTestId('storm')).not.toContainText('Hoje o mar está calmo');
});

test('review: a newly fetched old quote is not described as today', async ({ page }) => {
  await seed(page, { 'mxrf:markets': { month: '2026-01', used: 1, q: { '^BVSP': { price: 100, changePct: -0.03, change: -3, time: '2020-01-01T21:00:00Z', name: 'Ibovespa', closes: [110, 100], histDay: null, fetchedAt: Date.now() } } } });
  await page.goto('./#/tempestade');
  await expect(page.getByTestId('st-calm')).toContainText('Sem dados recentes para avaliar');
  await expect(page.getByTestId('st-reference')).toContainText('01/01/2020');
  await expect(page.getByTestId('st-reference')).toContainText('Dados antigos');
});

test('review: editing contribution updates the cost panel immediately', async ({ page }) => {
  await page.goto('./#/liberdade');
  await page.getByTestId('fr-contribution').fill('987,65');
  await expect(page.getByTestId('cost-freedom')).toContainText('987,65/mês');
});
