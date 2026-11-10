// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthPage, loadPayday, PAYDAY_KEY } from './pages/Month';
import { KidsPage } from './pages/Kids';
import { FamilyGoals } from './components/FamilyGoals';
import { StormPage } from './pages/Storm';
import { currentStorm } from './storm-state';
import { decodeCard } from '../family/share';

vi.mock('./data', () => ({
  useUniverse: () => ({ data: { assets: [] }, loading: false, error: null }),
  useMacro: () => ({ data: { tesouro: { bonds: [] } }, loading: false, error: null }),
}));

let root: Root;
let host: HTMLDivElement;
async function render(element: ReactElement) {
  await act(async () => { root.render(element); });
}
function element<T extends HTMLElement>(selector: string): T {
  const node = host.querySelector<T>(selector);
  if (!node) throw new Error(`Element not found: ${selector}`);
  return node;
}
const payday = (reserveHave = '0') => ({ configured: true, salary: '5005,10', rule: { kind: 'dia', day: 1 }, pct: '10', raise: { on: false, step: 1, everyMonths: 6, max: 20, start: '2026-01-01' }, reserveMonths: '6', reserveHave, reserveShare: 1, history: [], lastSalary: '5005,10' });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Regressões de planejamento na interface', () => {
  it('registra a reserva com centavos e preserva o valor ao remontar a página', async () => {
    localStorage.setItem(PAYDAY_KEY, JSON.stringify(payday()));
    await render(createElement(MonthPage));
    await act(async () => { element<HTMLButtonElement>('[data-testid="mo-markdone"]').click(); });
    expect(JSON.parse(localStorage.getItem(PAYDAY_KEY)!).reserveHave).toBe('500,51');
    expect(loadPayday().reserveHave).toBe('500,51');
    await render(createElement(MonthPage, { key: 'reload' }));
    expect(host.textContent).toContain('500,51');
    expect(host.textContent).not.toContain('50.051,00');
    expect(element('[data-testid="mo-reserve"]').textContent).not.toContain('completa');
  });

  it.each([['500.51', '500,51'], ['500.5', '500,5'], ['1.000', '1.000']])('lê saldo antigo %s sem confundir centavos e milhares', async (saved, expected) => {
    localStorage.setItem(PAYDAY_KEY, JSON.stringify(payday(saved)));
    expect(loadPayday().reserveHave).toBe(expected);
    await render(createElement(MonthPage));
    expect(JSON.parse(localStorage.getItem(PAYDAY_KEY)!).reserveHave).toBe(expected);
  });

  it('editar e salvar a meta dos filhos não multiplica o valor com centavos', async () => {
    const goal = { name: 'Ana', birth: '2020-01-01', goal: 'Faculdade', target: 1000.51, atAge: 18, monthly: 10.25, have: 100.75 };
    localStorage.setItem('mxrf:kids', JSON.stringify([goal]));
    await render(createElement(KidsPage));
    await act(async () => { element<HTMLButtonElement>('[aria-label="Editar Ana"]').click(); });
    expect(element<HTMLInputElement>('[data-testid="kid-target"]').value).toBe('1.000,51');
    await act(async () => { element<HTMLFormElement>('[data-testid="kid-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(JSON.parse(localStorage.getItem('mxrf:kids')!)).toEqual([goal]);
  });

  it('o consentimento familiar corresponde exatamente aos valores opcionais no código', async () => {
    await render(createElement(FamilyGoals, { me: { pct: 0.25, covered: ['Internet'], next: 'Luz', income: 500.51, total: 2002.04 } }));
    const read = () => decodeCard(element('[data-testid="fam-code"]').textContent!)!;
    const base = read();
    expect(base).not.toHaveProperty('income');
    expect(base).not.toHaveProperty('total');
    expect(host.textContent).toContain('sem atualização automática');
    expect(element<HTMLInputElement>('input[type="checkbox"]').parentElement!.textContent).toContain('renda mensal e total das despesas mensais');
    await act(async () => { element<HTMLInputElement>('input[type="checkbox"]').click(); });
    expect(read()).toEqual({ ...base, income: 500.51, total: 2002.04 });
    await act(async () => { element<HTMLInputElement>('input[type="checkbox"]').click(); });
    expect(read()).toEqual(base);
  });
});


describe('Dados e comunicação do Modo tempestade', () => {
  const cacheQuote = (time: string | null, fetchedAt: number) => {
    localStorage.setItem('mxrf:markets', JSON.stringify({ month: '2026-01', used: 1, q: { '^BVSP': {
      price: 100, changePct: -0.03, change: -3, time, name: 'Ibovespa', closes: [110, 100], histDay: null, fetchedAt,
    } } }));
  };

  it('não descreve ausência de dados como mercado calmo', async () => {
    expect(currentStorm()).toMatchObject({ hasData: false, active: false, referenceLabel: null });
    await render(createElement(StormPage));
    expect(element('[data-testid="st-calm"]').textContent).toContain('Sem dados recentes para avaliar');
    expect(host.textContent).not.toContain('Hoje o mar está calmo');
  });

  it('cotação antiga não vira atual porque foi consultada agora', async () => {
    cacheQuote('2020-01-01T21:00:00Z', Date.now());
    expect(currentStorm()).toMatchObject({ hasData: false, active: false, referenceKind: 'Cotação' });
    await render(createElement(StormPage));
    expect(element('[data-testid="st-calm"]').textContent).toContain('Sem dados recentes');
    expect(element('[data-testid="st-reference"]').textContent).toContain('01/01/2020');
    expect(element('[data-testid="st-reference"]').textContent).toContain('Dados antigos');
  });

  it('mostra referência de cotação recente sem dizer que a variação é de hoje', async () => {
    cacheQuote(new Date(Date.now() - 86400_000).toISOString(), Date.now());
    const state = currentStorm();
    expect(state).toMatchObject({ hasData: true, active: true, referenceKind: 'Cotação' });
    expect(state.referenceLabel).toBeTruthy();
    await render(createElement(StormPage));
    const active = element('[data-testid="st-active"]');
    expect(active.querySelector('p')!.textContent).toBe('Queda forte na última cotação disponível');
    expect(active.querySelectorAll('p')[1].textContent).toContain('na variação informada');
    expect(active.querySelectorAll('p')[1].textContent).not.toContain('hoje');
    expect(element('[data-testid="st-reference"]').textContent).toContain(state.referenceLabel!);
  });
});
