import type { MonthRow, SimulationResult } from '../engine';
import { fmtDecimal } from '../ui/format';

export interface ExportColumn {
  header: string;
  value: (r: MonthRow) => string | number;
  /** Valor numérico cru para planilhas. */
  numeric?: (r: MonthRow) => number;
}

const money = (pick: (r: MonthRow) => { toFixed(n: number): string }) => ({
  value: (r: MonthRow) => fmtDecimal(pick(r).toFixed(2), 2),
  numeric: (r: MonthRow) => Number(pick(r).toFixed(2)),
});
const precise = (pick: (r: MonthRow) => { toFixed(): string; decimalPlaces(): number }) => ({
  value: (r: MonthRow) => fmtDecimal(pick(r).toFixed(), Math.max(2, pick(r).decimalPlaces())),
  numeric: (r: MonthRow) => Number(pick(r).toFixed()),
});

export function exportColumns(includeReal: boolean): ExportColumn[] {
  const date = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const cols: ExportColumn[] = [
    { header: 'Ano', value: (r) => r.year, numeric: (r) => r.year },
    { header: 'Mês', value: (r) => r.month, numeric: (r) => r.month },
    { header: 'Data-com', value: (r) => date(r.recordDate) },
    { header: 'Pagamento/compra', value: (r) => date(r.paymentDate) },
    { header: 'Cotas iniciais', value: (r) => r.sharesStart, numeric: (r) => r.sharesStart },
    { header: 'Aporte (R$)', ...money((r) => r.contribution) },
    { header: 'Preço da cota (R$)', ...precise((r) => r.price) },
    { header: 'Dividendo por cota (R$)', ...precise((r) => r.dividendPerShare) },
    { header: 'Rendimento recebido (R$)', ...money((r) => r.income) },
    { header: 'IR retido (R$)', ...money((r) => r.dividendTax) },
    { header: 'Juros do caixa (R$)', ...money((r) => r.cashInterest) },
    { header: 'Dividendos retirados (R$)', ...money((r) => r.withdrawn) },
    { header: 'Cotas compradas', value: (r) => r.sharesBought, numeric: (r) => r.sharesBought },
    { header: 'Custos de negociação (R$)', ...money((r) => r.purchaseFees) },
    { header: 'Cotas finais', value: (r) => r.sharesEnd, numeric: (r) => r.sharesEnd },
    { header: 'Saldo residual (R$)', ...precise((r) => r.cashEnd) },
    { header: 'Valor das cotas (R$)', ...money((r) => r.sharesValue) },
    { header: 'Patrimônio total (R$)', ...money((r) => r.totalEquity) },
    { header: 'Patrimônio líquido se vendido (R$)', ...money((r) => r.netLiquidationEquity) },
  ];
  if (includeReal) {
    cols.push({ header: 'Renda real (R$ de hoje)', ...money((r) => r.realIncome) });
    cols.push({ header: 'Patrimônio real (R$ de hoje)', ...money((r) => r.realEquity) });
  }
  return cols;
}

function escapeCsv(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV para Excel brasileiro: UTF-8 com BOM, separador ";" e vírgula decimal. */
export function toCsv(result: SimulationResult, includeReal: boolean, meta: string[] = []): string {
  const cols = exportColumns(includeReal);
  const lines: string[] = [];
  for (const m of meta) lines.push(escapeCsv(m));
  if (meta.length) lines.push('');
  lines.push(cols.map((c) => escapeCsv(c.header)).join(';'));
  for (const r of result.rows) lines.push(cols.map((c) => escapeCsv(c.value(r))).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
