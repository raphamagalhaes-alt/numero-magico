import { memo, useState } from 'react';
import type { MonthRow, SimulationResult } from '../../engine';
import { fmtBRL, fmtBRLPrecise, fmtInt } from '../format';

interface Col { key: string; label: string; cell: (r: MonthRow) => string; essential?: boolean }

function columns(showReal: boolean, showContrib: boolean): Col[] {
  const c: Col[] = [
    { key: 'sharesStart', label: 'Cotas iniciais', cell: (r) => fmtInt(r.sharesStart), essential: true },
    ...(showContrib ? [{ key: 'contribution', label: 'Aporte', cell: (r: MonthRow) => fmtBRL(r.contribution) }] : []),
    { key: 'price', label: 'Preço', cell: (r) => fmtBRLPrecise(r.price) },
    { key: 'dps', label: 'Dividendo/cota', cell: (r) => fmtBRLPrecise(r.dividendPerShare) },
    { key: 'income', label: 'Rendimento', cell: (r) => fmtBRL(r.income), essential: true },
    { key: 'bought', label: 'Compradas', cell: (r) => fmtInt(r.sharesBought), essential: true },
    { key: 'sharesEnd', label: 'Cotas finais', cell: (r) => fmtInt(r.sharesEnd), essential: true },
    { key: 'cash', label: 'Saldo residual', cell: (r) => fmtBRLPrecise(r.cashEnd) },
    { key: 'value', label: 'Valor das cotas', cell: (r) => fmtBRL(r.sharesValue) },
    { key: 'equity', label: 'Patrimônio total', cell: (r) => fmtBRL(r.totalEquity), essential: true },
  ];
  if (showReal) {
    c.push({ key: 'realIncome', label: 'Renda real', cell: (r) => fmtBRL(r.realIncome) });
    c.push({ key: 'realEquity', label: 'Patrimônio real', cell: (r) => fmtBRL(r.realEquity) });
  }
  return c;
}

function DataTableImpl({ result, showReal, showContrib }: { result: SimulationResult; showReal: boolean; showContrib: boolean }) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const cols = columns(showReal, showContrib).filter((c) => !compact || c.essential);
  return (
    <section aria-label="Tabela detalhada" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="label">Tabela detalhada · 360 meses</h3>
        <div className="flex items-center gap-3 text-xs text-mist-400">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-gold-500/40 ring-1 ring-gold-500" aria-hidden />Recorde de compras</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-gain-500/30 ring-1 ring-gain-500" aria-hidden />Meta atingida</span>
          <div className="seg" role="group" aria-label="Colunas da tabela">
            <button type="button" aria-pressed={compact} onClick={() => setCompact(true)}>Essenciais</button>
            <button type="button" aria-pressed={!compact} onClick={() => setCompact(false)}>Todas</button>
          </div>
        </div>
      </div>
      <div className="card max-h-[70vh] overflow-auto" tabIndex={0} aria-label="Tabela com rolagem">
        <table data-testid="sim-table" className="num w-full border-separate border-spacing-0 text-right text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 bg-ink-800 px-3 py-2.5 text-left font-medium text-mist-300">Ano</th>
              <th scope="col" className="sticky top-0 z-10 bg-ink-800 px-3 py-2.5 font-medium text-mist-300">Mês</th>
              {cols.map((c) => <th key={c.key} scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-ink-800 px-3 py-2.5 font-medium text-mist-300">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => {
              const band = r.year % 2 === 0 ? 'bg-ink-850' : 'bg-ink-900';
              const hl = r.isGoalMonth ? 'bg-gain-500/15' : r.isPurchaseRecord ? 'bg-gold-500/10' : '';
              return (
                <tr key={r.month} data-month={r.month} data-record={r.isPurchaseRecord || undefined} data-goal={r.isGoalMonth || undefined} className={`${band} ${hl} ${r.monthOfYear === 1 ? '[&>td]:border-t [&>td]:border-white/5' : ''}`}>
                  <th scope="row" className={`sticky left-0 z-[5] whitespace-nowrap px-3 py-1.5 text-left font-medium ${band} ${r.monthOfYear === 1 ? 'text-gold-300' : 'text-transparent'}`}>
                    {r.monthOfYear === 1 ? `Ano ${r.year}` : <span className="sr-only">Ano {r.year}</span>}
                  </th>
                  <td className="px-3 py-1.5 text-mist-400">{r.month}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-3 py-1.5 ${c.key === 'bought' && r.isPurchaseRecord ? 'font-semibold text-gold-300' : c.key === 'equity' ? 'text-mist-100' : 'text-mist-300'}`}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export const DataTable = memo(DataTableImpl);
