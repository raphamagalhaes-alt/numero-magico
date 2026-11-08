import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetDetail } from '../../market/universe';
import { rebase } from '../../market/metrics';
import { fetchCached } from '../data';
import { fmtCompactBRL, fmtDecimal, fmtPct } from '../format';
import { go } from '../route';
import { getCompareList } from './Explorer';

/** Paleta categórica validada para o fundo escuro (+ 4ª cor validada no mesmo critério). */
const COLORS = ['#b08a2e', '#3f8fe0', '#d35fa0', '#7a6fd6'];

export function ComparePage({ tickersParam }: { tickersParam: string | null }) {
  const tickers = useMemo(() => (tickersParam ? tickersParam.split(',') : getCompareList()).filter((t) => /^[A-Z0-9]{4,8}$/.test(t)).slice(0, 4), [tickersParam]);
  const [details, setDetails] = useState<Record<string, AssetDetail | string>>({});
  useEffect(() => {
    let alive = true;
    for (const t of tickers) fetchCached<AssetDetail>(`/api/asset/${t}`).then((d) => alive && setDetails((s) => ({ ...s, [t]: d })), (e) => alive && setDetails((s) => ({ ...s, [t]: String(e.message ?? e) })));
    return () => { alive = false; };
  }, [tickers]);
  const ok = tickers.map((t) => details[t]).filter((d): d is AssetDetail => typeof d === 'object');
  const from = ok.length ? ok.map((d) => d.history[0]?.date ?? '').sort().reverse()[0] : undefined;
  const chart = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const d of ok) for (const p of rebase(d.history, from)) {
      const row = map.get(p.date) ?? { date: p.date };
      row[d.metrics.ticker] = Math.round(p.value * 100) / 100;
      map.set(p.date, row);
    }
    return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [ok, from]);

  if (tickers.length < 2) return (
    <section className="card p-6 text-sm text-mist-400">
      <h1 className="mb-2 text-xl font-semibold text-mist-100">Comparar ativos</h1>
      Selecione de 2 a 4 ativos em <button type="button" className="underline hover:text-gold-300" onClick={() => go('explorar')}>Explorar ativos</button> para comparar lado a lado.
    </section>
  );
  const rowsDef: { label: string; v: (d: AssetDetail) => string }[] = [
    { label: 'Classe', v: (d) => d.metrics.cls },
    { label: 'Preço (fechamento)', v: (d) => `R$ ${fmtDecimal(d.metrics.close, 2)}` },
    { label: 'Pregão', v: (d) => d.metrics.sessionDate.split('-').reverse().join('/') },
    { label: 'Variação 12 meses', v: (d) => (d.metrics.chg12m === null ? '—' : fmtPct(d.metrics.chg12m, 1)) },
    { label: 'Volatilidade anual', v: (d) => (d.metrics.vol12m === null ? '—' : fmtPct(d.metrics.vol12m, 1)) },
    { label: 'Queda máxima 12m', v: (d) => (d.metrics.maxDrawdown12m === null ? '—' : fmtPct(d.metrics.maxDrawdown12m, 1)) },
    { label: 'Liquidez média/dia', v: (d) => (d.metrics.avgVolume21 === null ? '—' : `R$ ${fmtCompactBRL(d.metrics.avgVolume21)}`) },
    { label: 'DY 12 meses', v: (d) => (d.metrics.dy12m === null || d.metrics.dy12m === undefined ? '—' : `${fmtPct(d.metrics.dy12m, 2)} (${d.metrics.dividends12mCount} pagamentos)`) },
    { label: 'Último rendimento', v: (d) => (d.metrics.lastDividend ? `R$ ${fmtDecimal(d.metrics.lastDividend.amount, Math.max(2, String(d.metrics.lastDividend.amount).split('.')[1]?.length ?? 0))} · data-com ${d.metrics.lastDividend.recordDate.split('-').reverse().join('/')}` : '—') },
    { label: 'P/VP (CVM)', v: (d) => (d.metrics.pvp ? fmtDecimal(d.metrics.pvp, 2) : '—') },
    { label: 'Cotistas', v: (d) => (d.metrics.shareholders ? fmtDecimal(d.metrics.shareholders, 0) : '—') },
    { label: 'Segmento', v: (d) => d.metrics.segment ?? '—' },
  ];
  return (
    <section aria-labelledby="cmp-title" className="flex flex-col gap-4">
      <h1 id="cmp-title" className="text-xl font-semibold">Comparar ativos</h1>
      {tickers.filter((t) => typeof details[t] === 'string').map((t) => <p key={t} className="text-sm text-loss-400" role="alert">{t}: {details[t] as string}</p>)}
      <div className="card overflow-x-auto">
        <table className="num w-full text-xs" data-testid="cmp-table">
          <thead className="bg-ink-800 text-mist-300"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Indicador</th>
            {ok.map((d, i) => <th key={d.metrics.ticker} scope="col" className="px-3 py-2 text-right font-medium"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i] }} aria-hidden />{d.metrics.ticker}</th>)}</tr></thead>
          <tbody>{rowsDef.map((r) => (
            <tr key={r.label} className="border-t border-white/5"><th scope="row" className="px-3 py-2 text-left font-normal text-mist-400">{r.label}</th>
              {ok.map((d) => <td key={d.metrics.ticker} className="px-3 py-2 text-right text-mist-200">{r.v(d)}</td>)}</tr>))}
          </tbody>
        </table>
      </div>
      {chart.length > 1 && (
        <figure className="card p-4" role="group" aria-label="Preço normalizado em base 100 desde a data inicial comum; valores na tabela acima.">
          <figcaption className="mb-2 text-sm font-medium">Preço normalizado (base 100) desde {from?.split('-').reverse().join('/')}</figcaption>
          <p className="mb-3 text-xs text-mist-500">Só preço: não inclui rendimentos distribuídos. Desempenho passado não garante resultados futuros.</p>
          <div className="h-72" aria-hidden><ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" stroke="#858c97" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => `${d.slice(5, 7)}/${d.slice(2, 4)}`} />
              <YAxis stroke="#858c97" fontSize={11} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#1b1f24', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }} labelFormatter={(d: string) => d.split('-').reverse().join('/')} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              {ok.map((d, i) => <Line key={d.metrics.ticker} dataKey={d.metrics.ticker} stroke={COLORS[i]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer></div>
        </figure>
      )}
    </section>
  );
}
