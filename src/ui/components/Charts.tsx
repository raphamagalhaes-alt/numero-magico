import { useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { SimulationResult } from '../../engine';
import { fmtBRL, fmtCompactBRL, fmtInt } from '../format';

/** Paleta categórica validada (CVD ΔE ≥ 8) no fundo #111316. */
export const SERIES = ['#b08a2e', '#3f8fe0', '#d35fa0'] as const;
const GRID = 'rgba(255,255,255,0.05)';
const AXIS = '#6c737e';
export const RANGES = [1, 5, 10, 20, 30] as const;

export type ChartKey = 'equity' | 'shares' | 'income' | 'cumDividends' | 'investedVsEquity' | 'nominalVsReal' | 'incomeVsGoal';

interface Point {
  month: number; equity: number; shares: number; income: number; realIncome: number; cumDividends: number;
  invested: number; realEquity: number;
}

function toPoints(r: SimulationResult): Point[] {
  const init = r.summary.initialInvestment;
  return r.rows.map((x) => ({
    month: x.month,
    equity: x.totalEquity.toNumber(),
    shares: x.sharesEnd,
    income: x.netIncome.toNumber(), // líquido de IR, mesma base da renda real e da meta
    realIncome: x.realIncome.toNumber(),
    cumDividends: x.cumIncome.toNumber(),
    invested: init.add(x.cumContributions).toNumber(),
    realEquity: x.realEquity.toNumber(),
  }));
}

const periodLabel = (m: number) => `Mês ${m} · Ano ${Math.floor((m - 1) / 12) + 1}`;

function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number; money?: boolean }) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="rounded-lg bg-ink-800/95 px-3 py-2 text-xs shadow-xl ring-1 ring-white/10">
      <div className="mb-1 font-medium text-mist-200">{periodLabel(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-mist-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span>{p.name}:</span>
          <span className="num ml-auto pl-3 font-medium text-mist-100">{money ? fmtBRL(String(p.value)) : fmtInt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Frame({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <figure className="card p-4" role="group" aria-label={`Gráfico: ${title}. ${desc} Os valores exatos estão na tabela detalhada abaixo.`}>
      <figcaption className="mb-3">
        <div className="text-sm font-medium text-mist-100">{title}</div>
        <div className="text-xs text-mist-500">{desc}</div>
      </figcaption>
      <div className="h-56 sm:h-64" aria-hidden="true">{children}</div>
    </figure>
  );
}

export function ChartsPanel({ result, charts, testId, showReal = true }: { result: SimulationResult; charts: ChartKey[]; testId?: string; showReal?: boolean }) {
  const [years, setYears] = useState<number>(30);
  const all = useMemo(() => toPoints(result), [result]);
  const data = useMemo(() => all.filter((p) => p.month <= years * 12), [all, years]);
  const goalMonth = result.summary.goalMonth;
  const goalVisible = goalMonth !== null && goalMonth <= years * 12;
  const goal = Number(result.input.incomeGoal);
  const ticks = years === 1 ? undefined : Array.from({ length: years }, (_, i) => i * 12 + 12).filter((_m, i) => years <= 10 || i % (years / 5) === (years / 5) - 1);

  const xAxis = (
    <XAxis dataKey="month" stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} ticks={ticks}
      tickFormatter={(m: number) => (years === 1 ? `M${m}` : `A${Math.round(m / 12)}`)} />
  );
  const yMoney = <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} width={64} tickFormatter={(v: number) => fmtCompactBRL(v)} />;
  const grid = <CartesianGrid stroke={GRID} vertical={false} />;
  const goalLine = goalVisible ? <ReferenceLine x={goalMonth!} stroke="#4cc38a" strokeDasharray="4 4" label={{ value: 'Meta', fill: '#4cc38a', fontSize: 11, position: 'insideTopLeft' }} /> : null;
  const legend = <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: '#aeb4bd' }} />;
  const line = (key: keyof Point, name: string, color: string, dashed = false) => (
    <Line type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2} dot={false} strokeDasharray={dashed ? '5 4' : undefined} activeDot={{ r: 4, strokeWidth: 2, stroke: '#111316' }} isAnimationActive={false} />
  );
  const area = (key: keyof Point, name: string) => (
    <>
      <defs>
        <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.35} />
          <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey={key} name={name} stroke={SERIES[0]} strokeWidth={2} fill={`url(#g-${key})`} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#111316' }} />
    </>
  );

  const render: Record<ChartKey, JSX.Element> = {
    equity: (
      <Frame key="equity" title="Evolução do patrimônio" desc="Valor das cotas + saldo residual (nominal), em R$.">
        <ResponsiveContainer><AreaChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{goalLine}{area('equity', 'Patrimônio')}</AreaChart></ResponsiveContainer>
      </Frame>
    ),
    shares: (
      <Frame key="shares" title="Evolução do número de cotas" desc="Cotas no encerramento de cada mês.">
        <ResponsiveContainer><AreaChart data={data}>{grid}{xAxis}<YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} width={64} tickFormatter={(v: number) => fmtInt(v)} /><Tooltip content={<ChartTooltip money={false} />} />{goalLine}{area('shares', 'Cotas')}</AreaChart></ResponsiveContainer>
      </Frame>
    ),
    income: (
      <Frame key="income" title="Evolução da renda mensal" desc="Rendimento líquido de IR recebido pelas cotas detidas na data-com.">
        <ResponsiveContainer><LineChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{legend}{goalLine}{line('income', 'Renda nominal', SERIES[0])}{showReal && line('realIncome', 'Renda real', SERIES[1], true)}</LineChart></ResponsiveContainer>
      </Frame>
    ),
    cumDividends: (
      <Frame key="cumDividends" title="Dividendos acumulados" desc="Soma dos rendimentos recebidos desde o mês 1.">
        <ResponsiveContainer><AreaChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{goalLine}{area('cumDividends', 'Dividendos acumulados')}</AreaChart></ResponsiveContainer>
      </Frame>
    ),
    investedVsEquity: (
      <Frame key="investedVsEquity" title="Capital aportado × patrimônio total" desc="A diferença entre as linhas é o crescimento acima do capital aportado.">
        <ResponsiveContainer><LineChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{legend}{goalLine}{line('equity', 'Patrimônio total', SERIES[0])}{line('invested', 'Capital aportado', SERIES[1], true)}</LineChart></ResponsiveContainer>
      </Frame>
    ),
    nominalVsReal: (
      <Frame key="nominalVsReal" title="Patrimônio nominal × real" desc="Real = nominal / (1 + inflação)^(t/12), em reais de hoje.">
        <ResponsiveContainer><LineChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{legend}{goalLine}{line('equity', 'Nominal', SERIES[0])}{line('realEquity', 'Real', SERIES[1], true)}</LineChart></ResponsiveContainer>
      </Frame>
    ),
    incomeVsGoal: (
      <Frame key="incomeVsGoal" title="Renda em relação à meta" desc={`Meta ${result.input.incomeGoalBasis === 'real' ? 'real' : 'nominal'}: ${fmtBRL(result.input.incomeGoal)}/mês.`}>
        <ResponsiveContainer><LineChart data={data}>{grid}{xAxis}{yMoney}<Tooltip content={<ChartTooltip />} />{legend}
          <ReferenceLine y={goal} stroke="#8a919c" strokeDasharray="4 4" label={{ value: 'Meta', fill: '#aeb4bd', fontSize: 11, position: 'insideTopRight' }} />
          {goalLine}{line(result.input.incomeGoalBasis === 'real' ? 'realIncome' : 'income', result.input.incomeGoalBasis === 'real' ? 'Renda real' : 'Renda nominal', SERIES[0])}
        </LineChart></ResponsiveContainer>
      </Frame>
    ),
  };

  return (
    <section aria-label="Gráficos" data-testid={testId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label">Gráficos</h2>
        <div className="seg" role="group" aria-label="Horizonte dos gráficos">
          {RANGES.map((y) => (
            <button key={y} type="button" aria-pressed={years === y} onClick={() => setYears(y)}>{y} {y === 1 ? 'ano' : 'anos'}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{charts.map((c) => render[c])}</div>
    </section>
  );
}
