import type { SimulationResult } from '../engine';
import { exportColumns } from './csv';

/** Gera .xlsx com a tabela do cenário selecionado e uma aba de premissas. Carregado sob demanda. */
export async function toXlsx(result: SimulationResult, includeReal: boolean, meta: string[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MXRF11 · O Número Mágico';
  const ws = wb.addWorksheet('Simulação', { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = exportColumns(includeReal);
  ws.addRow(cols.map((c) => c.header)).font = { bold: true };
  for (const r of result.rows) ws.addRow(cols.map((c) => (c.numeric ? c.numeric(r) : c.value(r))));
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, c.header.length + 2);
    if (c.header.includes('(R$')) col.numFmt = c.header.startsWith('Dividendo') || c.header.startsWith('Saldo') || c.header.startsWith('Preço') ? '#,##0.00####' : '#,##0.00';
  });
  const ps = wb.addWorksheet('Premissas');
  meta.forEach((m) => ps.addRow([m]));
  ps.getColumn(1).width = 120;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
