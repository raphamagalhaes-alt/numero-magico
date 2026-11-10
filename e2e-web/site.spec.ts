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
  // Simulador com a chave: ação sem rendimento na brapi gratuita → aplica o PREÇO real (antes ficava em "sem cotação")
  await page.goto('./#/simulador?t=VALE3');
  await page.reload();
  await expect(page.getByTestId('in-price')).toHaveValue('9,10');
  await expect(page.getByTestId('status-badge')).toContainText('rendimento informado por você');
  await expect(page.getByTestId('status-badge')).not.toContainText('Sem cotação');
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

test('site: Carteira com calendário de renda e teste da renda fixa; Diário de decisões; Metas da família', async ({ page }) => {
  const ext = watchNetwork(page);
  await page.goto('./#/dados');
  const txt = readFileSync('server/fixtures/cotahist-multi-2026-11-06.txt', 'latin1');
  await page.getByTestId('import-file').setInputFiles({ name: 'COTAHIST_D06112026.TXT', mimeType: 'text/plain', buffer: Buffer.from(txt, 'latin1') });
  await expect(page.getByTestId('import-quotes')).toContainText('1 pregões');
  // MXRF11 abre no exemplo didático; um toque troca para a cotação real
  await page.goto('./#/simulador');
  await page.getByTestId('use-real').click();
  await expect(page.getByTestId('status-badge')).toContainText('Dados de mercado');
  await expect(page.getByTestId('in-price')).toHaveValue('9,10');
  await page.evaluate(() => localStorage.setItem('mxrf:positions', JSON.stringify([{ ticker: 'MXRF11', shares: 1000 }])));
  await page.goto('./#/carteira');
  // calendário: 12 meses projetados a partir dos rendimentos estimados (CVM) do fundo
  const cal = page.getByTestId('income-calendar');
  await expect(cal.locator('[data-ym]')).toHaveCount(12);
  await expect(page.getByTestId('cal-weakest')).toContainText('Mês mais fraco');
  // teste da renda fixa compara com Selic líquida (dados abertos do BCB)
  await expect(page.getByTestId('fixed-income-test')).toContainText('Tesouro Selic');
  await expect(page.getByTestId('fit-verdict')).toContainText('Tesouro Selic líquido');

  // Diário: alerta de impulso quando falta reserva / há emoção
  await page.goto('./#/diario');
  await page.getByTestId('jr-ticker').fill('mxrf11');
  await page.getByTestId('jr-reason').fill('Completa a parte de imobiliários da minha divisão e paga todo mês.');
  await expect(page.getByTestId('jr-impulse')).toBeVisible();
  for (const i of [0, 1, 2, 3, 4]) await page.getByTestId(`jr-q${i}`).check();
  await expect(page.getByTestId('jr-impulse')).toHaveCount(0);
  await page.getByTestId('jr-save').click();
  const item = page.getByTestId('jr-list').locator('li').first();
  await expect(item).toContainText('Comprar MXRF11');
  await expect(item).toContainText('R$ 9,10'); // preço preenchido automaticamente
  await expect(item).toContainText('5/5');
  // revisão vencida aparece como aviso em todas as páginas
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('mxrf:journal')!); l[0].revisit = '2020-01-01'; localStorage.setItem('mxrf:journal', JSON.stringify(l)); });
  await page.goto('./#/mercados');
  await page.getByTestId('journal-banner').click();
  await expect(page.getByTestId('jr-review')).toBeVisible();

  // Metas da família: código de ida e volta, sem valores por padrão
  await page.goto('./#/liberdade');
  await page.getByTestId('fam-name').fill('Rapha');
  const code = (await page.getByTestId('fam-code').textContent())!;
  expect(code).toMatch(/^NM1:/);
  const other = code; // simula o código recebido de outra pessoa
  await page.getByTestId('fam-name').fill('Mãe');
  await page.getByTestId('fam-paste').fill(`Olha o meu: ${other}`);
  await page.getByTestId('fam-add').click();
  await expect(page.getByTestId('fam-board')).toContainText('Rapha');
  await expect(page.getByTestId('fam-board')).toContainText('Mãe (você)');
  await page.getByTestId('fam-paste').fill('código errado');
  await page.getByTestId('fam-add').click();
  await expect(page.getByTestId('family')).toContainText('Código inválido');
  expect(ext.filter((h) => B3.test(h))).toEqual([]);
});

test('site: Meu mês (dia do salário) e Quanto custa em liberdade', async ({ page }) => {
  await page.goto('./#/mes');
  await page.getByTestId('mo-salary').fill('5.000');
  await page.getByTestId('mo-rule').selectOption('d1'); // todo dia 1 → já caiu neste mês
  await page.getByTestId('mo-reserve-have').fill('30.000'); // reserva completa (6 × R$ 4.270)
  await page.getByTestId('mo-save-setup').click();
  await expect(page.getByTestId('mo-due')).toContainText('Hora do plano do mês');
  await expect(page.getByTestId('mo-save')).toHaveText('R$ 500,00');
  await expect(page.getByTestId('mo-reserve')).toContainText('completa');
  await expect(page.getByTestId('mo-invest')).toHaveText('R$ 500,00');
  await expect(page.getByTestId('mo-gain')).toContainText('Adianta sua liberdade');
  // aviso aparece nas outras páginas até o plano ser feito
  await page.goto('./#/mercados');
  await page.getByTestId('payday-banner').click();
  await page.getByTestId('mo-markdone').click();
  await expect(page.getByTestId('mo-done')).toContainText('R$ 500,00 guardados');
  await expect(page.getByTestId('mo-streak')).toContainText('1 mês seguido');
  await page.goto('./#/mercados');
  await expect(page.getByTestId('payday-banner')).toHaveCount(0);
  // aumento de salário → sugestão de guardar metade do aumento
  await page.goto('./#/mes');
  await page.getByRole('button', { name: 'Ajustar salário e regras' }).click();
  await page.getByTestId('mo-salary').fill('6.000');
  await page.getByTestId('mo-save-setup').click();
  await expect(page.getByTestId('mo-raise')).toContainText('R$ 1.000,00');
  await page.getByRole('button', { name: 'Sim, guardar metade' }).click();
  await expect(page.getByTestId('mo-raise')).toHaveCount(0);

  // Quanto custa em liberdade (com o plano padrão da Liberdade)
  await page.goto('./#/liberdade');
  const cost = page.getByTestId('cost-freedom');
  await cost.getByTestId('cost-value').fill('3.000');
  await expect(cost.getByTestId('cost-result')).toContainText('atrasa sua liberdade em');
  const once = await cost.getByTestId('cost-result').locator('p').nth(1).textContent();
  await cost.getByTestId('cost-monthly').click();
  const monthly = await cost.getByTestId('cost-result').locator('p').nth(1).textContent();
  expect(monthly).not.toEqual(once);
  expect(monthly).toMatch(/ano|mais de 100/);
});

test('site: menu do celular com "Mais"', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 640, 'só no celular');
  await page.goto('./#/mes');
  await page.getByTestId('more-btn').click();
  await page.getByTestId('more-menu').getByText('Diário').click();
  await expect(page.getByTestId('journal')).toBeVisible();
  await expect(page.getByTestId('more-menu')).toHaveCount(0);
});

test('site: Modo tempestade (aviso, promessa, seus números) e metas dos filhos', async ({ page }) => {
  // simula Ibovespa -3,2% hoje, guardado pela página Mercados neste aparelho
  await page.addInitScript(() => {
    const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    localStorage.setItem('mxrf:markets', JSON.stringify({ month, used: 1, q: { '^BVSP': { price: 120000, change: -3960, changePct: -0.032, time: null, name: 'Ibovespa', closes: [128000, 130000, 124000], histDay: null, fetchedAt: Date.now() } } }));
    localStorage.setItem('mxrf:payday', JSON.stringify({ configured: true, salary: '5000', rule: { kind: 'dia', day: 28 }, pct: '10', raise: { on: false, step: 1, everyMonths: 6, max: 20, start: '2026-01-01' }, reserveMonths: '6', reserveHave: '25620', reserveShare: 1, history: [], lastSalary: '5000' }));
  });
  await page.goto('./#/mercados');
  await page.getByTestId('storm-banner').click();
  await expect(page.getByTestId('st-active')).toContainText('-3,2% hoje');
  await expect(page.getByTestId('st-numbers')).toContainText('6 meses'); // 25.620 ÷ 4.270 de contas
  await expect(page.getByTestId('st-history')).toContainText('2020');
  await page.getByTestId('st-rule-input').fill('Não vou vender nada e vou manter meus aportes.');
  await page.getByTestId('st-rule-save').click();
  await expect(page.getByTestId('st-promise')).toContainText('Não vou vender nada');
  // no Diário, tentar vender durante a tempestade mostra o lembrete
  await page.goto('./#/diario');
  await page.getByTestId('jr-action').selectOption('Vender');
  await expect(page.getByTestId('jr-storm')).toBeVisible();

  // Filhos
  await page.goto('./#/filhos');
  await page.getByTestId('kid-name').fill('Ana');
  await page.getByTestId('kid-birth').fill('2018-03-10');
  await page.getByTestId('kid-target').fill('100.000');
  await page.getByTestId('kid-monthly').fill('300');
  await page.getByTestId('kid-save').click();
  const card = page.getByTestId('kid-card');
  await expect(card).toContainText('Ana');
  await expect(card).toContainText('Faculdade');
  await expect(card.getByTestId('kid-projected')).toContainText('R$');
  await expect(card.getByTestId('kid-reach')).toContainText('anos');
  await card.getByTestId('kid-show').click();
  await expect(card.getByTestId('kid-view')).toContainText('Ana, sua árvore do dinheiro');
  await page.reload();
  await expect(page.getByTestId('kid-card')).toContainText('Ana');
});

test('site: Meu perfil — resumo, avatar no topo, perfil de investidor e cópia de segurança para outro aparelho', async ({ page, browser }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('mxrf:kids', JSON.stringify([{ name: 'Ana', birth: '2018-03-10', goal: 'Faculdade', target: 100000, atAge: 18, monthly: 300, have: 2000 }]));
    localStorage.setItem('mxrf:stormRule', JSON.stringify('Não vendo no pânico.'));
  });
  await page.goto('./#/mercados');
  await page.getByTestId('profile-btn').click();
  await page.getByTestId('pr-name').fill('Rapha');
  await expect(page.getByTestId('profile-btn')).toContainText('R');
  await page.getByRole('button', { name: 'Avatar 🦊' }).click();
  await expect(page.getByTestId('profile-btn')).toContainText('🦊');
  const sum = page.getByTestId('pr-summary');
  await expect(sum).toContainText('1 meta');
  await expect(sum).toContainText('Escrita ✓');
  await expect(sum).toContainText('Sem chave');
  // perfil de investidor
  await page.getByTestId('pr-quiz-start').click();
  for (let i = 0; i < 5; i++) await page.getByTestId(`pr-q${i}-1`).check();
  await page.getByTestId('pr-quiz-save').click();
  await expect(page.getByTestId('pr-quiz-result')).toHaveText('Moderado');
  // cópia de segurança → restaurar em outro "aparelho" (contexto limpo)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pr-download').click()]);
  const path = await dl.path();
  const content = readFileSync(path!, 'utf8');
  expect(content).toContain('Ana');
  expect(content).not.toContain('brapiToken');
  const ctx = await browser.newContext({ baseURL: page.url().replace(/#.*$/, ''), viewport: page.viewportSize()! });
  const other = await ctx.newPage();
  await other.addInitScript(() => { localStorage.setItem('mxrf:onboarded', 'true'); localStorage.setItem('mxrf:termsAccepted', JSON.stringify('2026-11-08')); });
  other.on('dialog', (d) => d.accept());
  await other.goto('./#/perfil');
  await expect(other.getByTestId('pr-summary')).toContainText('0 metas');
  await other.getByTestId('pr-restore').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(other.getByTestId('pr-summary')).toContainText('1 meta', { timeout: 10000 });
  await expect(other.getByTestId('pr-name')).toHaveValue('Rapha');
  await expect(other.getByTestId('pr-quiz-result')).toHaveText('Moderado');
  await ctx.close();
});

test('site: números separam os milhares enquanto digita e mostram o valor por extenso', async ({ page }) => {
  await page.goto('./#/liberdade');
  const cap = page.getByTestId('fr-extra-capital');
  await cap.fill('');
  await cap.pressSequentially('2000000');
  await expect(cap).toHaveValue('2.000.000');
  await expect(cap.locator('xpath=..').getByTestId('amount-words')).toHaveText('= 2 milhões');
  // apagar um dígito reagrupa
  await cap.press('Backspace');
  await expect(cap).toHaveValue('200.000');
  // conta com centavos
  const luz = page.getByLabel('Valor de Luz');
  await luz.fill('');
  await luz.pressSequentially('189,90');
  await expect(luz).toHaveValue('189,90');
  // simulador: meta digitada tecla a tecla e preço com ponto do teclado do celular
  await page.goto('./#/simulador');
  const goal = page.getByTestId('in-goal');
  await goal.fill('');
  await goal.pressSequentially('15000');
  await expect(goal).toHaveValue('15.000');
  await expect(page.getByText('= 15 mil')).toBeVisible();
  const price = page.getByTestId('in-price');
  await price.fill('');
  await price.pressSequentially('9.5');
  await expect(price).toHaveValue('9,5');
  await expect(page.getByTestId('magic-shares')).toContainText('190'); // 2 × 9,50 ÷ 0,10
});

test('site: Carteira exemplo em 6 classes e Divisão por classes na Carteira (% ideal e Comprar?)', async ({ page }) => {
  await page.route('https://brapi.dev/**', (route) => {
    const t = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
    return route.fulfill({ json: brapiQuote(t, t === 'AAPL34' ? 50 : t === 'PETR4' ? 40.5 : 10), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('./#/mercados');
  await page.getByTestId('mk-key').fill('minha-chave-pessoal-123');
  await page.getByTestId('mk-save').click();
  await page.getByTestId('mk-tab-exemplo').click();
  const ex = page.getByTestId('mk-example');
  for (const label of ['Ações Brasil: 25%', 'Fundos imobiliários: 25%', 'Tesouro Direto: 25%', 'Ações exterior: 20%', 'ETFs internacionais: 3%', 'Criptomoedas: 2%']) await expect(ex).toContainText(label);
  await expect(page.getByTestId('mk-ex-acoes')).toContainText('1,47% cada');
  await expect(page.getByTestId('mk-ex-fiis')).toContainText('1,92% cada');
  await expect(page.getByTestId('mk-ex-exterior').locator('li[data-symbol=MSFT34]')).toContainText('R$ 10,00');
  await expect(page.getByTestId('mk-ex-exterior')).toContainText('MSFT nos EUA');
  await expect(page.getByTestId('mk-ex-tesouro')).toContainText('Tesouro Selic 2031');
  await page.getByTestId('mk-use-classes').click();

  // Carteira: adicionar um BDR que ainda não tinha cotação no aparelho (busca na hora)
  await page.goto('./#/carteira');
  await page.getByTestId('pf-ticker').fill('PETR4');
  await page.getByTestId('pf-shares').fill('10');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('[data-testid=pf-table] tbody tr')).toHaveCount(1);
  await page.getByTestId('pf-ticker').fill('AAPL34');
  await page.getByTestId('pf-shares').fill('2');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('[data-testid=pf-table] tbody tr')).toHaveCount(2);
  const ap = page.getByTestId('pf-contrib');
  await expect(ap.getByTestId('ap-classes')).toBeVisible(); // veio do exemplo
  await ap.getByTestId('ap-fixed').fill('1.000');
  // PETR4 = 405 (ações 25%), AAPL34 = 100 (exterior 20%), renda fixa 1.000 (25%) → alvos 35,7% / 28,6% / 35,7%
  await expect(ap.locator('tr[data-ticker=PETR4]')).toContainText('Ações Brasil');
  await expect(ap.locator('tr[data-ticker=AAPL34]')).toContainText('Ações exterior');
  await expect(ap.locator('tr[data-ticker=AAPL34]').getByTestId('ap-buy-flag')).toHaveText('Sim');
  await expect(ap.locator('tr[data-ticker=renda-fixa]')).toContainText('Não');
  await expect(ap.getByTestId('ap-summary')).toContainText('Total a comprar');
});
