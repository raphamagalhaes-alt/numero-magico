import { useState } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import type { SimulationResult } from '../../engine';
import { downloadBlob, toCsv } from '../../export/csv';

export function ExportBar({ result, includeReal, meta, fileBase }: { result: SimulationResult; includeReal: boolean; meta: string[]; fileBase: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const xlsx = async () => {
    setBusy(true); setErr(null);
    try {
      const { toXlsx } = await import('../../export/excel');
      const buf = await toXlsx(result, includeReal, meta);
      downloadBlob(buf as BlobPart, `${fileBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) { setErr('Falha ao gerar Excel: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" className="btn" data-testid="export-csv" onClick={() => downloadBlob(toCsv(result, includeReal, meta), `${fileBase}.csv`, 'text/csv;charset=utf-8')}>
        <FileText size={14} aria-hidden />Exportar CSV
      </button>
      <button type="button" className="btn" onClick={xlsx} disabled={busy} aria-busy={busy}><FileSpreadsheet size={14} aria-hidden />Exportar Excel</button>
      <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} aria-hidden />Imprimir / PDF</button>
      {err && <span role="alert" className="text-xs text-loss-400">{err}</span>}
    </div>
  );
}
