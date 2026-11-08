import { expect, test } from '@playwright/test';

test('responsivo: sem rolagem horizontal e cards principais visíveis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-testid=sim-table] tbody tr')).toHaveCount(360);
});

test('celular: resultado principal visível na primeira tela', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1000) >= 640, 'apenas celular');
  await page.goto('/');
  const strip = page.getByTestId('mobile-strip');
  await expect(strip).toBeVisible();
  const box = await strip.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(viewport!.height);
});

test('celular: resumo da tabela em cartões por ano', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1000) >= 640, 'apenas celular');
  await page.goto('/');
  await expect(page.locator('[data-testid=year-cards] > div')).toHaveCount(30);
});

test('páginas novas sem rolagem horizontal', async ({ page }) => {
  for (const p of ['explorar', 'juros', 'carteira', 'dados']) {
    await page.goto(`/#/${p}`);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});
