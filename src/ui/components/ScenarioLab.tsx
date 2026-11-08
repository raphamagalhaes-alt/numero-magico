import { useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { simulate, type SimulationInput, type SimulationResult } from '../../engine';
import { SCENARIOS, buildScenarioInput, type ScenarioKind, type ScenarioParams } from '../../scenarios/scenarios';
import { fmtBRL, fmtCompactBRL, fmtInt } from '../format';
import { parseBR } from '../form';
import { SERIES } from './Charts';

const PARAM_LABEL: Record<keyof ScenarioParams, string> = {
  dividendCut: 'Redução do dividendo (%)', priceAnnualChange: 'Variação anual do preço (%)',
  dividendAnnualChange: 'Crescimento anual do dividendo (%)', inflationAnnual: 'Inflação anual (%)', monthlyContribution: 'Aporte mensal (R$)',
};

function NumInput({ label, value, onChange, pct }: { label: string; value: number; onChange: (v: number) => void; pct: boolean }) {
  const [txt, setTxt] = useState(String(pct ? +(value * 100).toFixed(4) : value).replace('.', ','));
  const [bad, setBad] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-xs text-mist-400">{label}
      <input className={`input num ${bad ? 'input-error' : ''}`} value={txt} inputMode="decimal" aria-invalid={bad}
        onChange={(e) => {
          setTxt(e.target.value);
          const parsed = parseBR(e.target.value.includes(',') ? e.target.value : e.target.value.replace(/^(-?\d+)\.(\d+)$/, '$1,$2'));
          const n = parsed === null ? NaN : Number(parsed);
          const ok = Number.isFinite(n) && (pct ? n > -100 : n >= 0);
          setBad(!ok);
          if (ok) onChange(pct ? n / 100 : n);
        }} />
    </label>
  );
}

export function ScenarioLab({ base }: { base: SimulationInput | null }) {
  const [selected, setSelected] = useState<ScenarioKind[]>(['estavel', 'conservador', 'otimista']);
  const [params, setParams] = useState<Record<ScenarioKind, ScenarioParams>>(() =>
    Object.fromEntries(SCENARIOS.map((s) => [s.kind, { ...s.defaults }])) as Record<ScenarioKind, ScenarioParams>);

  const results = useMemo(() => {
    if (!base) return [] as { kind: ScenarioKind; label: string; r: SimulationResult | null; error?: string }[];
    return selected.map((k) => {
      const def = SCENARIOS.find((s) => s.kind === k)!;
      try { return { kind: k, label: def.label, r: simulate(buildScenarioInput(base, k, params[k])) }; }
      catch (e) { return { kind: k, label: def.label, r: null, error: e instanceof Error ? e.message : String(e) }; }
    });
  }, [base, selected, params]);

  const data = useMemo(() => {
    const ok = results.filter((x) => x.r);
    if (!ok.length) return [];
    return ok[0].r!.rows.map((_, i) => {
      const p: Record<string, number> = { month: i + 1 };
      ok.forEach((x) => { p[x.kind] = x.r!.rows[i].totalEquity.toNumber(); });
      return p;
    });
  }, [results]);

  const toggle = (k: ScenarioKind) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 3 ? s : [...s, k]));
  const colorOf = (k: ScenarioKind) => SERIES[selected.indexOf(k)] ?? SERIES[0];

  return (
    <section id="laboratorio" aria-label="Laboratório de Cenários" className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><FlaskConical size={18} className="text-gold-400" aria-hidden /><h2 className="text-lg font-semibold">Laboratório de Cenários</h2></div>
      <p className="rounded-lg bg-ink-850 p-3 text-xs text-mist-400 ring-1 ring-white/5">
        Hipóteses matemáticas para análise de sensibilidade. Não são previsões sobre o MXRF11 nem sobre qualquer ativo. Variações de preço e dividendo são aplicadas a cada 12 meses; dividendos derivados são truncados, nunca arredondados para cima. Todos partem do mesmo número mágico (calculado com o dividendo da aba). Estável, Conservador e Otimista usam o aporte e a inflação da aba selecionada; o Personalizado usa os próprios. Selecione até 3 cenários.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SCENARIOS.map((s) => {
          const on = selected.includes(s.kind);
          return (
            <div key={s.kind} className={`card flex flex-col gap-3 p-4 ${on ? 'ring-gold-500/40' : ''}`}>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-[#c9a24a]" checked={on} disabled={!on && selected.length >= 3} onChange={() => toggle(s.kind)} />
                {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(s.kind) }} aria-hidden />}
                {s.label}
              </label>
              <p className="text-xs text-mist-400">{s.description}</p>
              {s.editable.map((k) => (
                <NumInput key={k} label={PARAM_LABEL[k]} value={params[s.kind][k]} pct={k !== 'monthlyContribution'}
                  onChange={(v) => setParams((p) => ({ ...p, [s.kind]: { ...p[s.kind], [k]: v } }))} />
              ))}
            </div>
          );
        })}
      </div>
      {results.some((x) => x.error) && <p role="alert" className="text-xs text-loss-400">{results.filter((x) => x.error).map((x) => `${x.label}: ${x.error}`).join(' · ')}</p>}
      {data.length > 0 && (
        <figure className="card p-4">
          <figcaption className="mb-3 text-sm font-medium">Patrimônio total por cenário (nominal)</figcaption>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" stroke="#6c737e" fontSize={11} tickLine={false} axisLine={false} ticks={[60, 120, 180, 240, 300, 360]} tickFormatter={(m: number) => `A${m / 12}`} />
                <YAxis stroke="#6c737e" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => fmtCompactBRL(v)} />
                <Tooltip contentStyle={{ background: '#1b1f24', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(m: number) => `Mês ${m} · Ano ${Math.floor((m - 1) / 12) + 1}`} formatter={(v: number) => fmtBRL(String(v))} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                {results.filter((x) => x.r).map((x) => (
                  <Line key={x.kind} dataKey={x.kind} name={x.label} stroke={colorOf(x.kind)} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
      {results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="num w-full text-right text-xs">
            <thead className="bg-ink-800 text-mist-300"><tr>
              <th className="px-3 py-2 text-left font-medium" scope="col">Cenário</th>
              <th className="px-3 py-2 font-medium" scope="col">Cotas finais</th><th className="px-3 py-2 font-medium" scope="col">Renda mês 360</th>
              <th className="px-3 py-2 font-medium" scope="col">Patrimônio final</th><th className="px-3 py-2 font-medium" scope="col">Patrimônio real</th>
              <th className="px-3 py-2 font-medium" scope="col">Capital aportado</th><th className="px-3 py-2 font-medium" scope="col">Meta</th>
            </tr></thead>
            <tbody>
              {results.filter((x) => x.r).map((x) => { const s = x.r!.summary; return (
                <tr key={x.kind} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2 text-left font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(x.kind) }} aria-hidden />{x.label}</th>
                  <td className="px-3 py-2">{fmtInt(s.finalShares)}</td><td className="px-3 py-2">{fmtBRL(s.finalIncome)}</td>
                  <td className="px-3 py-2 text-mist-100">{fmtBRL(s.finalEquity)}</td><td className="px-3 py-2">{fmtBRL(s.finalRealEquity)}</td>
                  <td className="px-3 py-2">{fmtBRL(s.totalInvested)}</td><td className="px-3 py-2">{s.goalMonth ? `Mês ${s.goalMonth}` : 'Não atingida'}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
