import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, parseCotahistAll } from './sources/cotahist';
import { HistoryStore } from './sources/history';
import { parseCsv, brNumber } from './sources/csv';
import { parseCvmFii } from './sources/cvm-fii';
import { parseSgs } from './sources/bcb';
import { parseTesouro } from './sources/tesouro';
import { mergeRates, parseBis, parseEcb, parseNyFed } from './sources/global-rates';
import { DividendStore, syncDividends } from './sources/fnet-all';
import { annualizedVolatility, averageVolume, dividendYield12m, maxDrawdown, pctChange, rebase } from '../src/market/metrics';

const fx = (f: string, enc: BufferEncoding = 'utf8') => readFileSync(join(__dirname, 'fixtures', f), enc);

describe('COTAHIST — universo completo', () => {
  const recs = parseCotahistAll(fx('cotahist-multi-2026-11-06.txt', 'latin1'));
  it('classifica ações, FII, ETF, BDR e Fiagro; ignora fracionário e opções', () => {
    const by = Object.fromEntries(recs.map((r) => [r.ticker, classify(r.bdi, r.name)]));
    expect(by).toMatchObject({ PETR4: 'ACAO', VALE3: 'ACAO', MXRF11: 'FII', HGLG11: 'FII', BOVA11: 'ETF', IVVB11: 'ETF', AAPL34: 'BDR', BBGO11: 'FIAGRO' });
    expect(recs.some((r) => r.ticker === 'PETR4F' || r.ticker === 'TOTSL30')).toBe(false);
  });
  it('lê fechamento e volume financeiro', () => {
    const m = recs.find((r) => r.ticker === 'MXRF11')!;
    expect(m.close).toBeCloseTo(9.1, 10);
    expect(m.volume).toBeGreaterThan(1_000_000);
    expect(recs.find((r) => r.ticker === 'PETR4')!.volume).toBeCloseTo(1500000000, 0);
  });
});

describe('HistoryStore', () => {
  it('insere pregões em ordem, mantém lacunas como ausentes e corta no limite', () => {
    const s = new HistoryStore(join(mkdtempSync(join(tmpdir(), 'h-')), 'h.json'), 3);
    const base = parseCotahistAll(fx('cotahist-multi-2026-11-06.txt', 'latin1'));
    const at = (date: string, k: number) => base.map((r) => ({ ...r, date, close: r.close * k }));
    s.addSession('2026-11-06', at('2026-11-06', 1));
    s.addSession('2026-11-04', at('2026-11-04', 0.9).filter((r) => r.ticker !== 'VALE3'));
    s.addSession('2026-11-05', at('2026-11-05', 0.95));
    expect(s.dates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(s.points('VALE3').map((p) => p.date)).toEqual(['2026-11-05', '2026-11-06']);
    s.addSession('2026-11-09', at('2026-11-09', 1.01));
    expect(s.dates).toEqual(['2026-11-05', '2026-11-06', '2026-11-09']);
    s.save();
  });
});

describe('CSV e números BR', () => {
  it('aspas, vírgulas internas e quebras', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
    expect(brNumber('1.234,56')).toBe(1234.56);
    expect(brNumber('13.75')).toBe(13.75);
    expect(brNumber('')).toBeNull();
  });
});

describe('CVM — informe mensal de FII', () => {
  it('ISIN → CNPJ, VP/cota e cotistas (referência mais recente)', () => {
    const m = parseCvmFii(fx('cvm-geral-excerpt.csv', 'latin1'), fx('cvm-complemento-excerpt.csv', 'latin1'));
    const mxrf = m.get('BRMXRFCTF008')!;
    expect(mxrf.cnpj).toBe('97521225000125');
    expect(mxrf.vpPerShare).toBeCloseTo(9.352547, 6);
    expect(mxrf.shareholders).toBeGreaterThan(1_000_000);
    expect(m.get('BRHGLGCTF004')?.cnpj).toBe('11728688000147');
  });
});

describe('Banco Central — SGS', () => {
  it('descarta datas futuras publicadas na série da meta Selic', () => {
    const pts = parseSgs(JSON.parse(fx('sgs-432-range.json')), '2026-11-08');
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((p) => p.date <= '2026-11-08')).toBe(true);
    expect(pts[pts.length - 1]).toEqual({ date: '2026-11-08', value: 13.75 });
    expect(parseSgs(JSON.parse(fx('sgs-432.json')), '2026-11-08')).toEqual([]); // "últimos N" traz só datas futuras
  });
});

describe('Tesouro Direto', () => {
  it('mantém só a data-base mais recente e remove duplicatas', () => {
    const t = parseTesouro(fx('tesouro-excerpt.csv'));
    expect(t.baseDate).toBe('2026-11-06');
    const keys = t.bonds.map((b) => b.type + b.maturity);
    expect(new Set(keys).size).toBe(keys.length);
    const ipca = t.bonds.find((b) => b.type === 'Tesouro IPCA+' && b.maturity === '2035-05-15')!;
    expect(ipca.buyRate).toBe(7.87);
    expect(ipca.buyPrice).toBe(2515.93);
  });
});

describe('Juros globais', () => {
  it('BIS, Fed NY e BCE; fontes diretas prevalecem', () => {
    const bis = parseBis(fx('bis-excerpt.csv'));
    expect(bis.find((r) => r.country === 'Reino Unido')?.rate).toBeTypeOf('number');
    const ny = parseNyFed(JSON.parse(fx('nyfed-effr.json')))!;
    expect(ny.rate).toBe(3.88);
    expect(ny.note).toContain('3.75');
    const ecb = parseEcb(fx('ecb-dfr.csv'))!;
    expect(ecb.rate).toBe(2.5);
    const merged = mergeRates(bis, [ny, ecb]);
    expect(merged.find((r) => r.country === 'Estados Unidos')?.source).toContain('New York');
    expect(merged.find((r) => r.country === 'Zona do Euro')?.source).toContain('BCE');
    for (let i = 1; i < merged.length; i++) expect(merged[i - 1].rate).toBeGreaterThanOrEqual(merged[i].rate);
  });
});

describe('Fundos.NET — sincronização de todos os FIIs', () => {
  const xml = fx('fnet-hglg11-2026-10.xml');
  const mx = fx('fnet-mxrf11-2026-10.xml');
  it('pagina, ignora documentos inativos, separa por ticker e é retomável', async () => {
    const calls: string[] = [];
    const fake = (async (u: string) => {
      calls.push(u);
      if (u.includes('pesquisarGerenciadorDocumentosDados')) {
        const data = u.includes('dataInicial=27/10/2026') ? [
          { id: 1, dataEntrega: '30/10/2026 16:31', status: 'AC', situacaoDocumento: 'A', versao: 1 },
          { id: 2, dataEntrega: '30/10/2026 17:00', status: 'AC', situacaoDocumento: 'A', versao: 1 },
          { id: 3, dataEntrega: '30/10/2026 17:10', status: 'IC', situacaoDocumento: 'I', versao: 1 },
        ] : [];
        return Response.json({ data, recordsFiltered: data.length });
      }
      if (u.endsWith('id=1')) return new Response(mx);
      if (u.endsWith('id=2')) return new Response(xml);
      return new Response('x', { status: 404 });
    }) as unknown as typeof fetch;
    const store = new DividendStore(join(mkdtempSync(join(tmpdir(), 'd-')), 'd.json'));
    const n = await syncDividends(store, fake, '2026-10-27', '2026-11-02', { pauseMs: 0 });
    expect(n).toBe(2);
    expect(store.get('MXRF11')[0]).toMatchObject({ amount: 0.095, recordDate: '2026-10-30', paymentDate: '2026-11-16' });
    expect(store.get('HGLG11')[0].amount).toBe(1.17);
    expect(store.get('HGLG13')).toHaveLength(1); // código de outra classe também é guardado, separado
    expect(calls.some((c) => c.endsWith('id=3'))).toBe(false);
    const again = await syncDividends(store, fake, '2026-10-27', '2026-11-02', { pauseMs: 0 });
    expect(again).toBe(0); // documentos já vistos não são baixados de novo
  });
});

describe('indicadores', () => {
  const pts = Array.from({ length: 260 }, (_, i) => ({ date: `d${String(i).padStart(3, '0')}`, close: 10 * (1 + 0.001) ** i, volume: 1000 + i }));
  it('variação, volume médio, drawdown, volatilidade e base 100', () => {
    expect(pctChange(pts, 252)).toBeCloseTo(1.001 ** 252 - 1, 10);
    expect(averageVolume(pts, 21)).toBeCloseTo(1000 + (239 + 259) / 2, 10);
    expect(maxDrawdown(pts)).toBe(0);
    expect(annualizedVolatility(pts)).toBeLessThan(1e-6); // tendência constante, sem oscilação
    const drop = [...pts.slice(0, 100), ...pts.slice(100).map((p) => ({ ...p, close: p.close * 0.5 }))];
    expect(maxDrawdown(drop)).toBeLessThan(-0.49);
    expect(rebase(pts)[0].value).toBe(100);
  });
  it('DY 12 meses usa data-com dentro da janela', () => {
    const divs = [
      { amount: 0.1, recordDate: '2025-10-31', paymentDate: '2025-11-14' },
      { amount: 0.1, recordDate: '2026-09-30', paymentDate: '2026-10-15' },
      { amount: 0.095, recordDate: '2026-10-30', paymentDate: '2026-11-16' },
    ];
    const r = dividendYield12m(divs, 8.8, '2026-11-08');
    expect(r.count).toBe(2);
    expect(r.dy).toBeCloseTo(0.195 / 8.8, 10);
  });
});

describe('SGS — contorno do 304 do servidor', () => {
  it('repete com a janela deslocada quando o SGS responde 304 sem conteúdo', async () => {
    const { getSgs } = await import('./sources/bcb');
    const seen: string[] = [];
    const fake = (async (u: string) => {
      seen.push(u);
      return u.includes('dataFinal=07/11/2026') ? new Response(null, { status: 304 }) : Response.json([{ data: '01/10/2026', valor: '0.82' }]);
    }) as unknown as typeof fetch;
    expect(await getSgs(fake, 433, '2024-10-08', '2026-11-07')).toEqual([{ data: '01/10/2026', valor: '0.82' }]);
    expect(seen[1]).toContain('dataFinal=08/11/2026');
  });
});

describe('cobertura de rendimentos', () => {
  it('retroativo interrompido não estende a cobertura; concluído estende', async () => {
    const fake = (async (u: string) => (u.includes('pesquisar') ? Response.json({ data: [], recordsFiltered: 0 }) : new Response('', { status: 404 }))) as unknown as typeof fetch;
    const store = new DividendStore(join(mkdtempSync(join(tmpdir(), 'c-')), 'd.json'));
    await syncDividends(store, fake, '2026-09-08', '2026-11-07', { pauseMs: 0 });
    expect(store.d.coveredFrom).toBe('2026-09-08');
    // simula retroativo parcial: só a primeira semana de um intervalo distante
    await syncDividends(store, fake, '2025-10-03', '2025-10-09', { pauseMs: 0 });
    expect(store.d.coveredFrom).toBe('2026-09-08');
    // retroativo completo até encostar na cobertura existente
    await syncDividends(store, fake, '2025-10-03', '2026-09-08', { pauseMs: 0 });
    expect(store.d.coveredFrom).toBe('2025-10-03');
  });
});
