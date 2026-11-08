import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { easterSunday, isStale, isTradingDay, previousTradingDay } from './calendar';
import { nextNineAm, shouldRunOn } from './scheduler';
import { HttpJsonProvider } from './providers/http-json';
import { ManualFileProvider } from './providers/manual';
import { JsonStore } from './store';
import { MarketService } from './service';
import type { MarketSnapshot } from '../src/market/types';
import { defaultDividend } from '../src/market/types';

const tmp = () => mkdtempSync(join(tmpdir(), 'mxrf-'));
const goodBody: Omit<MarketSnapshot, 'fetchedAt'> = {
  ticker: 'MXRF11', provider: 'teste',
  lastTrade: { price: '9.99', tradedAt: '2026-11-06T18:00:00-03:00', source: 'Fonte de teste' },
  lastPaidDividend: { amountPerShare: '0.100', recordDate: '2026-10-31', paymentDate: '2026-11-14', source: 'Teste' },
  lastAnnouncedDividend: { amountPerShare: '0.095', recordDate: '2026-11-28', paymentDate: '2026-12-12', source: 'Teste' },
};
const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('calendário B3', () => {
  it('Páscoa', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
  });
  it('fins de semana e feriados', () => {
    expect(isTradingDay('2026-11-07')).toBe(false); // sábado
    expect(isTradingDay('2026-11-08')).toBe(false); // domingo
    expect(isTradingDay('2026-11-20')).toBe(false); // Consciência Negra
    expect(isTradingDay('2026-04-03')).toBe(false); // Sexta-feira Santa
    expect(isTradingDay('2026-02-16')).toBe(false); // Carnaval
    expect(isTradingDay('2026-11-09')).toBe(true);
    expect(previousTradingDay('2026-11-09')).toBe('2026-11-06');
  });
  it('agendador pula sábado e roda em dia útil; próxima execução às 9h BRT', () => {
    expect(shouldRunOn(new Date('2026-11-07T12:00:00Z')).run).toBe(false);
    expect(shouldRunOn(new Date('2026-11-09T12:00:00Z')).run).toBe(true);
    expect(nextNineAm(new Date('2026-11-09T11:59:00Z'))).toBe('2026-11-09T12:00:00.000Z');
    expect(nextNineAm(new Date('2026-11-09T12:00:01Z'))).toBe('2026-11-10T12:00:00.000Z');
    expect(nextNineAm(new Date('2026-11-08T03:00:00Z'))).toBe('2026-11-09T12:00:00.000Z'); // domingo → segunda
    expect(nextNineAm(new Date('2026-11-19T13:00:00Z'))).toBe('2026-11-23T12:00:00.000Z'); // pula feriado 20/11 e fim de semana
  });
  it('dados desatualizados', () => {
    const now = new Date('2026-11-09T13:00:00Z'); // segunda 10h
    expect(isStale('2026-11-06', '2026-11-09T12:00:00Z', now)).toBe(false);
    expect(isStale('2026-11-05', '2026-11-09T12:00:00Z', now)).toBe(true);
    expect(isStale(null, null, now)).toBe(true);
    // pregão em andamento: às 15h de segunda ainda vale o fechamento de sexta; às 22h exige o de segunda
    expect(isStale('2026-11-06', '2026-11-09T18:00:00Z', new Date('2026-11-09T18:00:00Z'))).toBe(false);
    expect(isStale('2026-11-06', '2026-11-09T18:00:00Z', new Date('2026-11-10T01:00:00Z'))).toBe(true);
  });
});

describe('serviço de mercado', () => {
  const now = () => new Date('2026-11-07T12:00:00Z');
  it('sucesso: grava snapshot com fonte e horário da consulta', async () => {
    const svc = new MarketService(new HttpJsonProvider('https://x/{ticker}', undefined, 'teste', fakeFetch(200, goodBody)), new JsonStore(join(tmp(), 's.json')), now);
    const st = await svc.refresh('MXRF11');
    expect(st.lastError).toBeNull();
    expect(st.snapshot?.lastTrade?.price).toBe('9.99');
    expect(st.snapshot?.fetchedAt).toBeTruthy();
    expect(defaultDividend(st.snapshot!)?.kind).toBe('anunciado');
  });
  it('falha na atualização externa preserva o último conjunto válido', async () => {
    const file = join(tmp(), 's.json');
    const ok = new MarketService(new HttpJsonProvider('https://x/{ticker}', undefined, 'teste', fakeFetch(200, goodBody)), new JsonStore(file), now);
    await ok.refresh('MXRF11');
    const failing = new MarketService(new HttpJsonProvider('https://x/{ticker}', undefined, 'teste', fakeFetch(503, {})), new JsonStore(file), now);
    const st = await failing.refresh('MXRF11');
    expect(st.lastError).toMatch(/503/);
    expect(st.snapshot?.lastTrade?.price).toBe('9.99');
    const net = new MarketService(new HttpJsonProvider('https://x/{ticker}', undefined, 'teste', (async () => { throw new Error('rede indisponível'); }) as unknown as typeof fetch), new JsonStore(file), now);
    expect((await net.refresh('MXRF11')).snapshot?.lastTrade?.price).toBe('9.99');
  });
  it('rejeita dados sem fonte ou inválidos', async () => {
    const bad = { ...goodBody, lastTrade: { price: 'NaN', tradedAt: 'x', source: '' } };
    const svc = new MarketService(new HttpJsonProvider('https://x/{ticker}', undefined, 'teste', fakeFetch(200, bad)), new JsonStore(join(tmp(), 's.json')), now);
    const st = await svc.refresh('MXRF11');
    expect(st.snapshot).toBeNull();
    expect(st.lastError).toMatch(/rejeitados/);
  });
  it('provedor manual sem arquivo: não configurado e erro claro', async () => {
    const p = new ManualFileProvider(join(tmp(), 'nao-existe.json'));
    expect(p.isConfigured()).toBe(false);
    const st = await new MarketService(p, new JsonStore(join(tmp(), 's.json')), now).refresh('MXRF11');
    expect(st.lastError).toMatch(/não encontrado/);
    expect(st.automaticUpdates).toBe(false);
  });
  it('provedor manual lê arquivo preenchido, sem alegar atualização automática', async () => {
    const f = join(tmp(), 'm.json');
    writeFileSync(f, JSON.stringify({ MXRF11: goodBody }));
    const st = await new MarketService(new ManualFileProvider(f), new JsonStore(join(tmp(), 's.json')), now).refresh('MXRF11');
    expect(st.snapshot?.provider).toBe('manual');
    expect(st.automaticUpdates).toBe(false);
  });
});
