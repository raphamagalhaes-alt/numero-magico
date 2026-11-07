import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, RotateCcw, ShieldAlert } from 'lucide-react';
import { simulate, type SimulationResult } from '../engine';
import { ASSETS, DEFAULT_TICKER } from '../assets/registry';
import { demoParams, inputForTab, type MainTab } from '../scenarios/defaults';
import { marketApi, MarketApiError } from '../market/client';
import { defaultDividend, type MarketSnapshot, type MarketStatus } from '../market/types';
import { formFromParams, paramsFromForm, toBR, type FormField, type FormState } from './form';
import { load, loadRaw, save } from './storage';
import { Field } from './components/Field';
import { MagicCards } from './components/MagicCards';
import { ExecutiveSummary, GoalBanner } from './components/Summary';
import { ChartsPanel, type ChartKey } from './components/Charts';
import { DataTable } from './components/DataTable';
import { MarketPanel } from './components/MarketPanel';
import { ScenarioLab } from './components/ScenarioLab';
import { StrategyCompare } from './components/StrategyCompare';
import { ExportBar } from './components/ExportBar';
import { DISCLAIMER, LIMITATIONS, TAB_LABEL, reportMeta } from './report';

type Mode = 'demo' | 'market';
type Status = 'demo' | 'market' | 'custom';
interface Prefs { mode: Mode; status: Status; tab: MainTab; marketLabel: string }

const TICKER = DEFAULT_TICKER;
const DEFAULT_PREFS: Prefs = { mode: 'demo', status: 'demo', tab: 'nominal', marketLabel: '' };
const TABS: { id: MainTab; label: string; charts: ChartKey[] }[] = [
  { id: 'nominal', label: 'Nominal', charts: ['equity', 'shares', 'income', 'cumDividends', 'incomeVsGoal'] },
  { id: 'inflacao', label: 'Inflação', charts: ['nominalVsReal', 'income', 'equity', 'shares', 'cumDividends', 'incomeVsGoal'] },
  { id: 'aportes', label: 'Aportes mensais', charts: ['investedVsEquity', 'nominalVsReal', 'shares', 'income', 'cumDividends', 'incomeVsGoal'] },
];

const HELP: Record<FormField, string> = {
  price: 'Preço de uma cota em reais. No modo de mercado, o último preço negociado.',
  dividend: 'Rendimento mensal distribuído por cota. Aceita 3 ou mais casas decimais (ex.: 0,095).',
  desiredShares: 'Quantas cotas você quer comprar por mês somente com os dividendos. Define o número mágico.',
  inflationPct: 'Inflação anual usada para calcular valores reais e reajustar o aporte uma vez por ano.',
  contribution: 'Aporte mensal da aba "Aportes mensais", a partir do mês 2, reajustado a cada 12 meses pela inflação.',
  incomeGoal: 'Renda mensal desejada. A meta é atingida no primeiro mês em que a renda das cotas no início do mês a iguala ou supera.',
};

export function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => load('mxrf:prefs', DEFAULT_PREFS));
  const [form, setForm] = useState<FormState>(() => load('mxrf:form', formFromParams(demoParams(TICKER))));
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [localSnap, setLocalSnap] = useState<MarketSnapshot | null>(() => loadRaw('mxrf:manualSnapshot', null));
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState<string | null>(null);

  useEffect(() => save('mxrf:prefs', prefs), [prefs]);
  const statusRef = useRef(prefs.status);
  statusRef.current = prefs.status;
  useEffect(() => save('mxrf:form', form), [form]);

  const { params, errors } = useMemo(() => paramsFromForm(form, TICKER), [form]);
  const deferredParams = useDeferredValue(params);

  const results = useMemo(() => {
    if (!deferredParams) return null;
    const out = {} as Record<MainTab, SimulationResult>;
    for (const t of TABS) out[t.id] = simulate(inputForTab(deferredParams, t.id));
    return out;
  }, [deferredParams]);
  const tabResult = results?.[prefs.tab] ?? null;

  const statusLabel = prefs.status === 'custom' ? 'Cenário personalizado' : prefs.status === 'market' ? `Dados de mercado · ${prefs.marketLabel}` : 'Dados do exemplo original (vídeo)';

  const edit = (k: keyof FormState) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPrefs((p) => ({ ...p, status: 'custom' }));
  };

  const applySnapshot = useCallback((s: MarketSnapshot) => {
    const div = defaultDividend(s);
    if (!s.lastTrade || !div) return;
    setForm((f) => ({ ...f, price: toBR(s.lastTrade!.price), dividend: toBR(div.event.amountPerShare) }));
    const label = `${s.provider} · preço de ${new Date(s.lastTrade.tradedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · rendimento ${div.kind}`;
    setPrefs((p) => ({ ...p, status: 'market', mode: 'market', marketLabel: label }));
  }, []);

  const loadMarket = useCallback(async (refresh: boolean) => {
    setMLoading(true); setMError(null);
    try {
      const st = refresh ? await marketApi.refresh(TICKER) : await marketApi.status(TICKER);
      setMarket(st);
      return st;
    } catch (e) {
      setMError(e instanceof MarketApiError ? e.message : 'Falha ao consultar dados de mercado.');
      return null;
    } finally { setMLoading(false); }
  }, []);

  // Ao entrar no modo de mercado: consulta e aplica automaticamente, exceto sobre cenário personalizado.
  useEffect(() => {
    if (prefs.mode !== 'market') return;
    let cancelled = false;
    loadMarket(false).then((st) => {
      if (cancelled) return;
      const snap = st?.snapshot ?? localSnap;
      if (snap && statusRef.current !== 'custom') applySnapshot(snap);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.mode]);

  const setMode = (m: Mode) => {
    if (m === 'demo') {
      setForm((f) => ({ ...formFromParams(demoParams(TICKER)), contribution: f.contribution, incomeGoal: f.incomeGoal, incomeGoalBasis: f.incomeGoalBasis, inflationPct: f.inflationPct }));
      setPrefs((p) => ({ ...p, mode: 'demo', status: 'demo' }));
    } else {
      setPrefs((p) => ({ ...p, mode: 'market', status: p.status === 'custom' ? 'custom' : 'demo' }));
    }
  };

  const restore = () => {
    setForm(formFromParams(demoParams(TICKER)));
    setPrefs({ ...DEFAULT_PREFS, tab: prefs.tab });
  };

  const showReal = prefs.tab !== 'nominal';
  const showContrib = prefs.tab === 'aportes';
  const tabDef = TABS.find((t) => t.id === prefs.tab)!;
  const asset = ASSETS[TICKER];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 pb-10 sm:px-6">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-gold-500 focus:px-3 focus:py-2 focus:text-ink-950">Pular para o conteúdo</a>
      <header className="no-print z-40 sm:sticky sm:top-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-ink-950/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950" aria-hidden><BarChart3 size={18} /></div>
          <div>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{asset.ticker} <span className="text-gold-400">·</span> O Número Mágico</h1>
            <p className="text-[11px] text-mist-500">{asset.name} · Financial Intelligence Simulator 2.0</p>
          </div>
        </div>
        <nav aria-label="Seções" className="hidden gap-4 text-xs text-mist-400 lg:flex">
          <a className="hover:text-gold-300" href="#simulador">Simulador</a>
          <a className="hover:text-gold-300" href="#laboratorio">Laboratório</a>
          <a className="hover:text-gold-300" href="#estrategias">Estratégias</a>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Origem dos dados">
            <button type="button" aria-pressed={prefs.mode === 'demo'} onClick={() => setMode('demo')}>Demonstração</button>
            <button type="button" aria-pressed={prefs.mode === 'market'} onClick={() => setMode('market')}>Dados de mercado</button>
          </div>
          <span data-testid="status-badge" className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${prefs.status === 'custom' ? 'bg-gold-500/10 text-gold-300 ring-gold-500/30' : prefs.status === 'market' ? 'bg-gain-500/10 text-gain-400 ring-gain-500/30' : 'bg-ink-800 text-mist-300 ring-white/10'}`}>
            {statusLabel}
          </span>
          <button type="button" className="btn" onClick={restore} data-testid="restore"><RotateCcw size={14} aria-hidden />Restaurar padrão</button>
        </div>
      </header>

      <main id="conteudo" className="flex flex-col gap-6">
        {prefs.mode === 'demo' && (
          <p className="no-print rounded-lg bg-ink-850 p-3 text-xs text-mist-400 ring-1 ring-white/5">
            Modo Demonstração: valores do exemplo didático original (preço R$ 8,89, dividendo R$ 0,10). <strong className="text-mist-200">Não são cotações reais.</strong>
          </p>
        )}
        {prefs.mode === 'market' && (
          <div className="no-print">
            <MarketPanel status={market} localSnapshot={localSnap} loading={mLoading} error={mError} isCustom={prefs.status === 'custom'}
              onRefresh={() => loadMarket(true).then((st) => { if (st?.snapshot && prefs.status === 'market') applySnapshot(st.snapshot); })}
              onApply={applySnapshot}
              onSaveLocal={(s) => { setLocalSnap(s); save('mxrf:manualSnapshot', s); applySnapshot(s); }} />
          </div>
        )}

        <section id="simulador" aria-label="Parâmetros" className="no-print card grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-7">
          <Field label="Preço da cota" prefix="R$" value={form.price} onChange={edit('price')} error={errors.price} help={HELP.price} testId="in-price" />
          <Field label="Dividendo/cota" prefix="R$" value={form.dividend} onChange={edit('dividend')} error={errors.dividend} help={HELP.dividend} testId="in-dividend" />
          <Field label="Cotas desejadas/mês" value={form.desiredShares} onChange={edit('desiredShares')} error={errors.desiredShares} help={HELP.desiredShares} inputMode="numeric" testId="in-desired" />
          <Field label="Inflação anual" suffix="%" value={form.inflationPct} onChange={edit('inflationPct')} error={errors.inflationPct} help={HELP.inflationPct} testId="in-inflation" />
          <Field label="Aporte mensal" prefix="R$" value={form.contribution} onChange={edit('contribution')} error={errors.contribution} help={HELP.contribution} testId="in-contribution" />
          <Field label="Meta de renda mensal" prefix="R$" value={form.incomeGoal} onChange={edit('incomeGoal')} error={errors.incomeGoal} help={HELP.incomeGoal} testId="in-goal" />
          <div className="flex flex-col gap-1.5">
            <span className="label">Base da meta</span>
            <div className="seg" role="group" aria-label="Base da meta de renda">
              <button type="button" aria-pressed={form.incomeGoalBasis === 'nominal'} onClick={() => edit('incomeGoalBasis')('nominal')}>Nominal</button>
              <button type="button" aria-pressed={form.incomeGoalBasis === 'real'} onClick={() => edit('incomeGoalBasis')('real')}>Real (hoje)</button>
            </div>
          </div>
          <p className="col-span-full text-[11px] text-mist-500">Prazo fixo de 360 meses. Os cálculos são refeitos imediatamente a cada alteração.</p>
        </section>

        {!params && (
          <div role="alert" className="card flex items-center gap-2 p-4 text-sm text-loss-400"><ShieldAlert size={16} aria-hidden />Corrija os parâmetros destacados para recalcular a simulação.</div>
        )}

        {tabResult && <MagicCards magic={tabResult.magic} desired={tabResult.input.desiredShares} />}

        {tabResult && tabResult.magic.finite && (
          <>
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Simulações" className="seg">
                {TABS.map((t) => (
                  <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={prefs.tab === t.id} aria-controls="tabpanel"
                    onClick={() => setPrefs((p) => ({ ...p, tab: t.id }))}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                      const i = TABS.findIndex((x) => x.id === prefs.tab);
                      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                      setPrefs((p) => ({ ...p, tab: n.id }));
                      document.getElementById(`tab-${n.id}`)?.focus();
                    }}
                    tabIndex={prefs.tab === t.id ? 0 : -1}
                    className="!px-4 !py-2 !text-sm">{t.label}</button>
                ))}
              </div>
              <ExportBar result={tabResult} includeReal={showReal} fileBase={`mxrf11-${prefs.tab}-360m`} meta={reportMeta(tabResult, prefs.tab, statusLabel, TICKER)} />
            </div>

            <div className="print-only text-xs">
              {reportMeta(tabResult, prefs.tab, statusLabel, TICKER).map((l) => <p key={l} className="mb-1">{l}</p>)}
            </div>

            <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${prefs.tab}`} className="flex flex-col gap-6">
              <p className="text-xs text-mist-400">
                {prefs.tab === 'nominal' && 'Investimento inicial único, sem aportes, preço e dividendo constantes, reinvestimento integral dos dividendos.'}
                {prefs.tab === 'inflacao' && 'Mesma simulação nominal, com valores reais: valor real(t) = nominal(t) / (1 + inflação)^(t/12), mês 0 como data-base.'}
                {prefs.tab === 'aportes' && 'Começa com o número mágico; aportes a partir do mês 2, reajustados pela inflação a cada 12 meses (meses 13, 25, 37…).'}
              </p>
              <GoalBanner result={tabResult} />
              <ExecutiveSummary result={tabResult} showReal={showReal} showContrib={showContrib} />
              <ChartsPanel result={tabResult} charts={tabDef.charts} testId="charts" showReal={showReal} />
              <DataTable result={tabResult} showReal={showReal} showContrib={showContrib} />
            </div>

            <div className="no-print flex flex-col gap-10 border-t border-white/5 pt-8">
              <StrategyCompare base={tabResult.input} />
              <ScenarioLab base={tabResult.input} />
            </div>
          </>
        )}
      </main>

      <footer className="mt-auto flex flex-col gap-3 border-t border-white/5 pt-6 text-xs text-mist-500">
        <p data-testid="disclaimer" className="text-mist-400">{DISCLAIMER}</p>
        <details className="no-print">
          <summary className="cursor-pointer text-mist-400 hover:text-gold-300">Simplificações e limitações do modelo</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
        <p>Aba atual: {TAB_LABEL[prefs.tab]} · Fontes oficiais para conferência: {asset.officialSources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a className="underline hover:text-gold-300" href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a></span>)}</p>
      </footer>
    </div>
  );
}
