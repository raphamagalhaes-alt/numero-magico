import { useMemo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { simulate, type SimulationInput, type SimulationResult } from '../../engine';
import { fmtBRL, fmtPct } from '../format';
import { dec } from '../../engine';

const SHOCKS: { label: string; desc: string; apply: (i: SimulationInput) => SimulationInput }[] = [
  { label: 'Corte de 20% no dividendo', desc: 'desde o 1º mês', apply: (i) => ({ ...i, dividendInitialChange: '-0.2', initialSharesOverride: null }) },
  { label: 'Dividendo cai 3% ao ano', desc: 'erosão contínua', apply: (i) => ({ ...i, dividendAnnualChange: '-0.03' }) },
  { label: 'Fim da isenção: IR 15% nos rendimentos', desc: 'mudança legislativa hipotética', apply: (i) => ({ ...i, dividendTaxRate: '0.15' }) },
  { label: 'Preço cai 2% ao ano', desc: 'desvalorização contínua', apply: (i) => ({ ...i, priceAnnualChange: '-0.02' }) },
];

export function StressTests({ result }: { result: SimulationResult }) {
  const base = result.summary;
  const out = useMemo(() => SHOCKS.map((s) => {
    // mesmo capital inicial do cenário-base (número mágico calculado sem o choque)
    const r = simulate({ ...s.apply(result.input), initialSharesOverride: result.summary.initialShares });
    return { ...s, s: r.summary };
  }), [result]);
  const delta = (a: ReturnType<typeof dec>, b: ReturnType<typeof dec>) => (b.isZero() ? '—' : fmtPct(a.div(b).sub(1), 1));
  return (
    <section aria-labelledby="st-title" className="flex flex-col gap-3" data-testid="stress">
      <h2 id="st-title" className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert size={18} className="text-gold-400" aria-hidden />Testes de estresse</h2>
      <p className="text-xs text-mist-400">O que acontece com este mesmo plano (mesmo capital inicial e aportes) se algo der errado. Choques hipotéticos para medir sensibilidade.</p>
      <div className="card overflow-x-auto">
        <table className="num w-full text-xs">
          <thead><tr className="bg-ink-800 text-mist-300">{['Cenário', 'Renda no mês 360', 'Δ renda', 'Patrimônio no mês 360', 'Δ patrimônio', 'Meta'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            <tr className="border-t border-white/5 bg-ink-850"><th scope="row" className="px-3 py-2 text-left font-medium">Base</th><td className="px-3 py-2 text-right">{fmtBRL(base.finalIncome)}</td><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 text-right">{fmtBRL(base.finalEquity)}</td><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 text-right">{base.goalMonth ? `Mês ${base.goalMonth}` : 'Não atingida'}</td></tr>
            {out.map((o) => (
              <tr key={o.label} className="border-t border-white/5">
                <th scope="row" className="px-3 py-2 text-left font-normal text-mist-200">{o.label}<span className="block text-[11px] text-mist-500">{o.desc}</span></th>
                <td className="px-3 py-2 text-right">{fmtBRL(o.s.finalIncome)}</td>
                <td className="px-3 py-2 text-right text-loss-400">{delta(o.s.finalIncome, base.finalIncome)}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(o.s.finalEquity)}</td>
                <td className="px-3 py-2 text-right text-loss-400">{delta(o.s.finalEquity, base.finalEquity)}</td>
                <td className="px-3 py-2 text-right">{o.s.goalMonth ? `Mês ${o.s.goalMonth}` : 'Não atingida'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
