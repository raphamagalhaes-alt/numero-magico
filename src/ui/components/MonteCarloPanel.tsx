import { useDeferredValue, useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dec, monteCarlo, type SimulationResult } from '../../engine';
import { fmtBRL, fmtCompactBRL, fmtPct } from '../format';
import { parseBR } from '../form';
import { InfoTip } from './InfoTip';

export function MonteCarloPanel({ result, histVol }: { result: SimulationResult; histVol: number | null }) {
  const [volP, setVolP] = useState(histVol ? (histVol * 100).toFixed(1).replace('.', ',') : '15');
  const [driftP, setDriftP] = useState('0');
  const [volD, setVolD] = useState('10');
  const [driftD, setDriftD] = useState('0');
  const n = (s: string, d: number) => { const v = parseBR(s); return v === null ? d : Number(v) / 100; };
  const params = useDeferredValue({ volP, driftP, volD, driftD });
  const i = result.input;
  const mc = useMemo(() => monteCarlo({
    price: Number(i.price), dividend: Number(i.dividend), initialShares: result.summary.initialShares, months: i.months,
    monthlyContribution: Number(i.monthlyContribution), contributionStartMonth: i.contributionStartMonth, inflationAnnual: Number(i.inflationAnnual),
    priceDriftAnnual: n(params.driftP, 0), priceVolAnnual: Math.max(0, n(params.volP, 0.15)), dividendDriftAnnual: n(params.driftD, 0), dividendVolAnnual: Math.max(0, n(params.volD, 0.1)),
    incomeGoal: Number(i.incomeGoal), paths: 500,
  }), [i, result.summary.initialShares, params]);
  const data = mc.equity.map((e) => ({ year: e.year, faixa: [e.p10, e.p90] as [number, number], p50: e.p50 }));
  const det = result.summary.finalEquity.toNumber();

  return (
    <section aria-labelledby="mc-title" className="flex flex-col gap-3" data-testid="montecarlo">
      <h2 id="mc-title" className="flex items-center gap-2 text-lg font-semibold"><Dices size={18} className="text-gold-400" aria-hidden />Faixas de resultado (Monte Carlo)
        <InfoTip text="500 trajetórias hipotéticas: o preço oscila mês a mês com a volatilidade informada e o dividendo varia ano a ano. A faixa mostra do 10º ao 90º percentil do patrimônio nominal. Volatilidade padrão = histórica de 12 meses do ativo (B3). Não é previsão." /></h2>
      <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-mist-400">Volatilidade do preço (% a.a.){histVol ? <span className="text-[11px] text-mist-500">histórica 12m: {fmtPct(histVol, 1)}</span> : null}<input className="input num" value={volP} onChange={(e) => setVolP(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-mist-400">Tendência do preço (% a.a.)<input className="input num" value={driftP} onChange={(e) => setDriftP(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-mist-400">Volatilidade do dividendo (% a.a.)<input className="input num" value={volD} onChange={(e) => setVolD(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-mist-400">Tendência do dividendo (% a.a.)<input className="input num" value={driftD} onChange={(e) => setDriftD(e.target.value)} /></label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="label">Pessimista (P10)</div><div className="num text-lg font-semibold">{fmtBRL(mc.finalEquity.p10.toFixed(2))}</div></div>
        <div className="card p-4"><div className="label">Mediana (P50)</div><div className="num text-lg font-semibold text-gold-300">{fmtBRL(mc.finalEquity.p50.toFixed(2))}</div></div>
        <div className="card p-4"><div className="label">Otimista (P90)</div><div className="num text-lg font-semibold">{fmtBRL(mc.finalEquity.p90.toFixed(2))}</div></div>
        <div className="card p-4"><div className="label">Chance de atingir a meta</div><div className="num text-lg font-semibold" data-testid="mc-prob">{fmtPct(dec(mc.goalProbability), 0)}</div><div className="text-[11px] text-mist-500">renda nominal ≥ {fmtBRL(i.incomeGoal)} em algum mês</div></div>
      </div>
      <figure className="card p-4" role="group" aria-label="Faixa do patrimônio entre os percentis 10 e 90 e mediana por ano; valores-chave nos cartões acima.">
        <figcaption className="mb-2 text-sm font-medium">Patrimônio nominal por ano — faixa P10–P90 e mediana</figcaption>
        <div className="h-64" aria-hidden><ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="year" stroke="#858c97" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(y: number) => `A${y}`} />
            <YAxis stroke="#858c97" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => fmtCompactBRL(v)} />
            <Tooltip contentStyle={{ background: '#1b1f24', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }} labelFormatter={(y: number) => `Ano ${y}`}
              formatter={(v: number | number[], name: string) => (Array.isArray(v) ? [`${fmtBRL(v[0].toFixed(2))} – ${fmtBRL(v[1].toFixed(2))}`, 'Faixa P10–P90'] : [fmtBRL(Number(v).toFixed(2)), name === 'p50' ? 'Mediana' : name])} />
            <Area dataKey="faixa" stroke="none" fill="#b08a2e" fillOpacity={0.2} isAnimationActive={false} />
            <Line dataKey="p50" stroke="#b08a2e" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer></div>
        <p className="mt-2 text-[11px] text-mist-500">Caminho determinístico (preço e dividendo constantes): {fmtBRL(det.toFixed(2))}. Estimativa estatística em ponto flutuante; a tabela de 360 meses continua sendo o cálculo exato.</p>
      </figure>
    </section>
  );
}
