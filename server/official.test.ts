import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { COTAHIST_URL, FNET_DOC, OfficialB3FnetProvider, activeDocuments, parseCotahist, parseFnetDividendXml } from './providers/official';
import { extraHolidays, isTradingDay } from './calendar';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');
const COTAHIST = fx('cotahist-2026-11-06-excerpt.txt');
const MXRF_XML = fx('fnet-mxrf11-2026-10.xml');
const HGLG_XML = fx('fnet-hglg11-2026-10.xml');

describe('parser COTAHIST (B3) — layout posicional oficial', () => {
  it('extrai fechamento, data do pregão e ISIN do MXRF11', () => {
    const q = parseCotahist(COTAHIST, 'MXRF11')!;
    expect(q.sessionDate).toBe('2026-11-06');
    expect(q.close).toBe('8.80');
    expect(q.open).toBe('8.64');
    expect(q.high).toBe('8.90');
    expect(q.low).toBe('8.58');
    expect(q.isin).toBe('BRMXRFCTF008');
    expect(parseCotahist(COTAHIST, 'HGLG11')!.close).toBe('146.52');
    expect(parseCotahist(COTAHIST, 'XXXX11')).toBeNull();
  });
});

describe('parser Fundos.NET — Aviso aos Cotistas estruturado', () => {
  it('lê valor, data-com, pagamento e isenção', () => {
    const p = parseFnetDividendXml(MXRF_XML);
    expect(p.cnpj).toBe('97521225000125');
    expect(p.dividends).toEqual([{ ticker: 'MXRF11', amount: '0.095', recordDate: '2026-10-30', paymentDate: '2026-11-16', taxExempt: true, period: 'Outubro-2026' }]);
  });
  it('documento com vários códigos: separa por ticker (HGLG11 × HGLG13)', () => {
    const p = parseFnetDividendXml(HGLG_XML);
    expect(p.dividends.map((d) => d.ticker)).toEqual(['HGLG11', 'HGLG13']);
  });
});

/** Servidor falso com as mesmas URLs oficiais. */
type FakeDoc = { id: number; dataEntrega: string; xml: string; status?: string; situacaoDocumento?: string; versao?: number };
function fakeOfficial(opts: { files: Record<string, string>; docs: FakeDoc[]; fnetStatus?: number; calls?: string[] }) {
  return (async (input: string | URL) => {
    const url = String(input);
    opts.calls?.push(url);
    for (const [date, txt] of Object.entries(opts.files)) {
      if (url === COTAHIST_URL(date)) return new Response(zipSync({ [`COTAHIST_${date}.TXT`]: strToU8(txt) }), { status: 200 });
    }
    if (url.includes('/InstDados/SerHist/')) return new Response('not found', { status: 404 });
    if (url.includes('pesquisarGerenciadorDocumentosDados')) {
      if (opts.fnetStatus) return new Response('erro', { status: opts.fnetStatus });
      return Response.json({ data: opts.docs.map(({ xml: _x, ...meta }) => meta) });
    }
    const doc = opts.docs.find((d) => url === FNET_DOC(d.id));
    if (doc) return new Response(doc.xml, { status: 200 });
    return new Response('?', { status: 404 });
  }) as unknown as typeof fetch;
}
const SEP_XML = MXRF_XML.replace('<DataBase>2026-10-30</DataBase>', '<DataBase>2026-09-30</DataBase>').replace('0.095', '0.1').replace('<DataPagamento>2026-11-16</DataPagamento>', '<DataPagamento>2026-10-15</DataPagamento>');

describe('provedor oficial B3 + Fundos.NET', () => {
  it('monta snapshot: fechamento, anunciado (a pagar) e pago, com fontes e prazo observado', async () => {
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' },
      now: () => new Date('2026-11-08T12:00:00Z'), // domingo
      fetchImpl: fakeOfficial({ files: { '2026-11-06': COTAHIST }, docs: [{ id: 2, dataEntrega: '30/10/2026 16:31', xml: MXRF_XML }, { id: 1, dataEntrega: '30/09/2026 17:06', xml: SEP_XML }] }),
    });
    const s = await p.fetchSnapshot('MXRF11');
    expect(s.lastTrade).toMatchObject({ price: '8.80', sessionDate: '2026-11-06', kind: 'fechamento' });
    expect(s.lastTrade!.sourceUrl).toContain('COTAHIST_D06112026.ZIP');
    expect(s.lastAnnouncedDividend).toMatchObject({ amountPerShare: '0.095', recordDate: '2026-10-30', paymentDate: '2026-11-16', taxExempt: true });
    expect(s.lastPaidDividend).toMatchObject({ amountPerShare: '0.1', paymentDate: '2026-10-15' });
    expect(s.lastPaidDividend!.sourceUrl).toContain('exibirDocumento?id=1');
    expect(s.paymentLagBusinessDays).toBe(10);
    expect(s.administrator).toContain('BTG Pactual');
  });
  it('após a data de pagamento, o anunciado passa a ser "pago"', async () => {
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, now: () => new Date('2026-11-17T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-16': COTAHIST.replace(/20261106/g, '20261116') }, docs: [{ id: 2, dataEntrega: '30/10/2026 16:31', xml: MXRF_XML }] }),
    });
    const s = await p.fetchSnapshot('MXRF11');
    expect(s.lastAnnouncedDividend).toBeNull();
    expect(s.lastPaidDividend?.amountPerShare).toBe('0.095');
  });
  it('aprende dia útil sem arquivo da B3 como dia sem pregão', async () => {
    const learned: string[] = [];
    // 2031-03-12 (quarta) sem arquivo; último arquivo em 2031-03-11
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, now: () => new Date('2031-03-14T13:00:00Z'),
      onMissingSessions: (d) => learned.push(...d),
      fetchImpl: fakeOfficial({ files: { '2031-03-11': COTAHIST.replace(/20261106/g, '20310311') }, docs: [] }),
    });
    const t = await p.fetchLastTrade('MXRF11');
    expect(t.sessionDate).toBe('2031-03-11');
    expect(learned).toEqual(['2031-03-12']); // 13/03 tem < 2 dias: ainda não é considerado feriado
  });
  it('documento de outro fundo/ticker é ignorado; falha só do Fundos.NET gera snapshot parcial', async () => {
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, now: () => new Date('2026-11-08T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-06': COTAHIST }, docs: [{ id: 9, dataEntrega: '30/10/2026 17:00', xml: HGLG_XML }] }),
    });
    const s = await p.fetchSnapshot('MXRF11');
    expect(s.lastAnnouncedDividend).toBeNull();
    const bad = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, now: () => new Date('2026-11-08T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-06': COTAHIST }, docs: [], fnetStatus: 503 }), retryDelayMs: 1,
    });
    const partial = await bad.fetchSnapshot('MXRF11');
    expect(partial.lastTrade?.price).toBe('8.80');
    expect(partial.partial).toEqual({ trade: true, dividends: false });
    expect(partial.partialErrors?.[0]).toMatch(/503/);
  });
});

describe('feriados aprendidos alimentam o calendário', () => {
  it('registerExtraHolidays', async () => {
    const { registerExtraHolidays } = await import('../src/engine/calendar');
    registerExtraHolidays(['2031-03-12']);
    expect(isTradingDay('2031-03-12')).toBe(false);
    expect(extraHolidays()).toContain('2031-03-12');
  });
});

describe('revisão: documentos e robustez do provedor oficial', () => {
  const NOV_V2 = MXRF_XML.replace('<ValorProvento>0.095</ValorProvento>', '<ValorProvento>0.096</ValorProvento>');
  it('descarta documentos inativos (IC) e cancelados (CC); retificação de maior versão prevalece', () => {
    expect(activeDocuments([
      { id: 1, dataEntrega: '', status: 'IC', situacaoDocumento: 'I', versao: 1 },
      { id: 2, dataEntrega: '', status: 'AC', situacaoDocumento: 'A', versao: 2 },
      { id: 3, dataEntrega: '', status: 'CC', situacaoDocumento: 'C' },
    ]).map((d) => d.id)).toEqual([2]);
  });
  it('com versões 1 (inativa) e 2 (ativa) do mesmo aviso, usa a 2', async () => {
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, now: () => new Date('2026-11-08T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-06': COTAHIST }, docs: [
        { id: 5, dataEntrega: '31/10/2026 10:00', xml: NOV_V2, status: 'AC', situacaoDocumento: 'A', versao: 2 },
        { id: 4, dataEntrega: '30/10/2026 16:31', xml: MXRF_XML, status: 'IC', situacaoDocumento: 'I', versao: 1 },
      ] }),
    });
    expect((await p.fetchSnapshot('MXRF11')).lastAnnouncedDividend?.amountPerShare).toBe('0.096');
  });
  it('ISIN divergente no COTAHIST é rejeitado', async () => {
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: { MXRF11: '97521225000125' }, isinByTicker: { MXRF11: 'BRXXXXCTF000' }, now: () => new Date('2026-11-08T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-06': COTAHIST }, docs: [] }),
    });
    await expect(p.fetchLastTrade('MXRF11')).rejects.toThrow(/ISIN divergente/);
  });
  it('ativo sem negócios no pregão recua ao anterior; COTAHIST baixado uma vez para vários ativos', async () => {
    const calls: string[] = [];
    const onlyHglg = COTAHIST.split('\n').filter((l) => l.includes('HGLG11')).join('\n');
    const p = new OfficialB3FnetProvider({
      cnpjByTicker: {}, now: () => new Date('2026-11-08T12:00:00Z'),
      fetchImpl: fakeOfficial({ files: { '2026-11-06': onlyHglg, '2026-11-05': COTAHIST.replace(/20261106/g, '20261105') }, docs: [], calls }),
    });
    expect((await p.fetchLastTrade('MXRF11')).sessionDate).toBe('2026-11-05');
    await p.fetchLastTrade('HGLG11');
    expect(calls.filter((u) => u.includes('COTAHIST_D06112026')).length).toBe(1);
  });
  it('fator de cotação (FATCOT) divide o preço', () => {
    const line = COTAHIST.split('\n')[0];
    const withFactor = line.slice(0, 210) + '0001000' + line.slice(217);
    expect(parseCotahist(withFactor, line.slice(12, 24).trim())!.close).toBe(String(Number(parseCotahist(line, line.slice(12, 24).trim())!.close) / 1000));
  });
});
