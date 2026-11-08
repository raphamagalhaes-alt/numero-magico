import { expect, test } from '@playwright/test';

test.describe('app instalável (PWA) e isolado no navegador', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'verificação de instalabilidade via Chrome DevTools Protocol');

  test('o Chrome considera instalável, abre offline e o cache guarda só arquivos do próprio site', async ({ page, context }) => {
    await page.addInitScript(() => localStorage.setItem('mxrf:onboarded', 'true'));
    await page.goto('./#/simulador');
    await expect(page.getByTestId('magic-shares')).toHaveText('178');
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || navigator.serviceWorker?.ready, null, { timeout: 15000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // passa a ser controlada pelo service worker
    await expect(page.getByTestId('magic-shares')).toHaveText('178');

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors') as { installabilityErrors: { errorId: string }[] };
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);

    // brapi (externo) nunca entra no cache
    await page.route('https://brapi.dev/**', (r) => r.fulfill({ json: { results: [] }, headers: { 'access-control-allow-origin': '*' } }));
    await page.evaluate(() => fetch('https://brapi.dev/api/quote/PETR4?token=x').catch(() => null));
    const cached = await page.evaluate(async () => { const out: string[] = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
    expect(cached.length).toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;
    expect(cached.every((u) => u.startsWith(origin))).toBe(true);

    // offline: o app continua abrindo (simulação local)
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('magic-shares')).toHaveText('178');
    await context.setOffline(false);
  });
});
