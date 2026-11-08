import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { simulate } from '../engine';
import { demoParams, inputForTab } from '../scenarios/defaults';
import { toCsv } from './csv';
import { buildXlsx } from './excel';

const r = simulate(inputForTab({ ...demoParams(), startMonth: '2026-11' }, 'aportes'));

describe('exportação', () => {
  it('CSV: BOM, ponto e vírgula, vírgula decimal, datas e 360 linhas', () => {
    const csv = toCsv(r, true, ['Premissa A']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.split('\r\n');
    expect(lines.filter((l) => /^\d+;\d+;/.test(l))).toHaveLength(360);
    expect(lines.find((l) => l.startsWith('1;1;'))).toContain('30/10/2026;16/11/2026;178;0,00;8,89;0,10;17,80');
  });
  it('XLSX válido: pacote OOXML com 2 planilhas, cabeçalho e 361 linhas', () => {
    const files = unzipSync(buildXlsx(r, true, ['Premissa A', 'Premissa <B> & C']));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect((sheet.match(/<row /g) ?? []).length).toBe(361);
    expect(sheet).toContain('<v>1582.42</v>'.replace('1582.42', '17.8')); // rendimento mês 1 numérico
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('Premissa &lt;B&gt; &amp; C');
  });
});
