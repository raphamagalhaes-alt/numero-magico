import { useMemo, useState } from 'react';
import { Globe2, Landmark } from 'lucide-react';
import { useGlobalRates, useMacro } from '../data';
import { fmtDecimal } from '../format';

const br = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const unitFmt = (v: number, unit: string) => (unit === 'R$' ? `R$ ${fmtDecimal(v, 4)}` : `${fmtDecimal(v, 2)}${unit.startsWith('%') ? unit.replace('%', '%') : ` ${unit}`}`);

export function RatesPage() {
  const m = useMacro();
  const g = useGlobalRates();
  const [type, setType] = useState('Todos');
  const types = useMemo(() => ['Todos', ...new Set((m.data?.tesouro.bonds ?? []).map((b) => b.type))], [m.data]);
  const bonds = (m.data?.tesouro.bonds ?? []).filter((b) => type === 'Todos' || b.type === type);
  const ind = (k: string) => m.data?.indicators.find((i) => i.key === k);

  return (
    <section aria-labelledby="rates-title" className="flex flex-col gap-6">
      <div>
        <h1 id="rates-title" className="text-xl font-semibold">Juros e renda fixa</h1>
        <p className="text-sm text-mist-400">Indicadores oficiais do Banco Central, preços e taxas do Tesouro Direto e juros básicos de bancos centrais do mundo, atualizados diariamente às 9h e 21h30 (Brasília).</p>
      </div>
      {m.error && <p className="card p-4 text-sm text-loss-400" role="alert">{m.error}</p>}
      {m.loading && <p className="card p-4 text-sm text-mist-400" role="status">Carregando indicadores…</p>}
      {m.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="macro-cards">
            {['selic_meta', 'cdi', 'ipca_12m', 'ipca_mes', 'igpm_mes', 'dolar_ptax', 'euro_ptax'].map((k) => {
              const i = ind(k);
              if (!i) return null;
              return (
                <div key={k} className="card flex flex-col gap-1 p-4">
                  <div className="label">{i.label}</div>
                  <div className="num text-xl font-semibold text-gold-300">{i.last ? unitFmt(i.last.value, i.unit) : '—'}</div>
                  <div className="text-[11px] text-mist-500">Referência {br(i.last?.date)} · <a className="underline hover:text-gold-300" href={i.sourceUrl} target="_blank" rel="noreferrer noopener">BCB/SGS {i.code}</a></div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Landmark size={18} className="text-gold-400" aria-hidden />Tesouro Direto</h2>
              <label className="flex items-center gap-2 text-xs text-mist-400">Tipo
                <select className="input !w-auto !py-1.5 text-xs" value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
            </div>
            <p className="text-xs text-mist-500">Data-base {br(m.data.tesouro.baseDate)} · Fonte: <a className="underline hover:text-gold-300" href={m.data.tesouro.sourceUrl} target="_blank" rel="noreferrer noopener">{m.data.tesouro.source || 'Tesouro Transparente'}</a>. Taxas anuais; para títulos indexados, a taxa é a parcela acima do indexador (IPCA ou Selic).</p>
            <div className="card max-h-[60vh] overflow-auto">
              <table className="num w-full text-xs" data-testid="tesouro-table">
                <thead><tr className="text-mist-300">
                  {['Título', 'Vencimento', 'Taxa compra', 'Taxa venda', 'PU compra', 'PU venda'].map((h, i) => <th key={h} scope="col" className={`sticky top-0 bg-ink-800 px-3 py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}
                </tr></thead>
                <tbody>{bonds.map((b) => (
                  <tr key={b.type + b.maturity} className="border-t border-white/5 odd:bg-ink-900">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-mist-200">{b.type}</th>
                    <td className="px-3 py-2">{br(b.maturity)}</td>
                    <td className="px-3 py-2 text-right">{b.buyRate === null ? '—' : `${fmtDecimal(b.buyRate, 2)}%`}</td>
                    <td className="px-3 py-2 text-right">{b.sellRate === null ? '—' : `${fmtDecimal(b.sellRate, 2)}%`}</td>
                    <td className="px-3 py-2 text-right">{b.buyPrice ? `R$ ${fmtDecimal(b.buyPrice, 2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right">{b.sellPrice ? `R$ ${fmtDecimal(b.sellPrice, 2)}` : '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Globe2 size={18} className="text-gold-400" aria-hidden />Juros básicos no mundo</h2>
        {g.error && <p className="card p-4 text-sm text-loss-400" role="alert">{g.error}</p>}
        {g.data && (
          <div className="card overflow-x-auto">
            <table className="num w-full text-xs" data-testid="global-table">
              <thead><tr className="bg-ink-800 text-mist-300">{['País/região', 'Banco central', 'Taxa (% a.a.)', 'Data', 'Fonte'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{g.data.rates.map((r) => (
                <tr key={r.country} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-mist-200">{r.country}</th>
                  <td className="px-3 py-2 text-mist-400">{r.centralBank}{r.note ? <span className="block text-[11px] text-mist-500">{r.note}</span> : null}</td>
                  <td className="px-3 py-2 text-right font-medium text-gold-300">{fmtDecimal(r.rate, 2)}</td>
                  <td className="px-3 py-2">{br(r.date)}</td>
                  <td className="px-3 py-2"><a className="underline hover:text-gold-300" href={r.sourceUrl} target="_blank" rel="noreferrer noopener">{r.source}</a></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-mist-500">O BIS consolida as taxas oficiais divulgadas por cada banco central, com alguns dias de defasagem; Fed (EFFR) e BCE vêm direto das fontes. A data indica a última observação disponível.</p>
      </div>
    </section>
  );
}
