import { expect, test } from '@playwright/test';

test('responsivo: sem rolagem horizontal e cards principais visíveis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('magic-shares')).toHaveText('178');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-testid=sim-table] tbody tr')).toHaveCount(360);
});
