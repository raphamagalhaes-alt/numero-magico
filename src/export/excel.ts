import { strToU8, zipSync } from 'fflate';
import type { SimulationResult } from '../engine';
import { exportColumns } from './csv';

/**
 * Gerador XLSX mínimo (Office Open XML) sem dependências pesadas: planilha "Simulação" com
 * cabeçalho fixo e números reais (formatados em R$ pelo Excel) + planilha "Premissas".
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

type Cell = { v: string | number; style?: number };
function sheetXml(rows: Cell[][], opts: { freeze?: boolean; widths?: number[] } = {}): string {
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    const s = c.style ? ` s="${c.style}"` : '';
    return typeof c.v === 'number' && Number.isFinite(c.v)
      ? `<c r="${ref}"${s}><v>${c.v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const views = opts.freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  const cols = opts.widths ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

// estilos: 0 padrão · 1 cabeçalho negrito · 2 moeda 2 casas · 3 decimal até 6 casas · 4 inteiro
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00####"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function buildXlsx(result: SimulationResult, includeReal: boolean, meta: string[]): Uint8Array {
  const cols = exportColumns(includeReal);
  const styleOf = (h: string) => (!h.includes('(R$') ? 4 : /^(Preço|Dividendo|Saldo)/.test(h) ? 3 : 2);
  const rows: Cell[][] = [cols.map((c) => ({ v: c.header, style: 1 }))];
  for (const r of result.rows) rows.push(cols.map((c) => (c.numeric ? { v: c.numeric(r), style: styleOf(c.header) } : { v: String(c.value(r)) })));
  // aviso também na planilha principal (não só em Premissas)
  rows.push([], [{ v: meta[meta.length - 1] ?? '' }]);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Simulação" sheetId="1" r:id="rId1"/><sheet name="Premissas" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows, { freeze: true, widths: cols.map((c) => Math.max(11, c.header.length + 2)) })),
    'xl/worksheets/sheet2.xml': strToU8(sheetXml(meta.map((m) => [{ v: m }]), { widths: [140] })),
  };
  return zipSync(files);
}

export async function toXlsx(result: SimulationResult, includeReal: boolean, meta: string[]): Promise<Uint8Array> {
  return buildXlsx(result, includeReal, meta);
}
