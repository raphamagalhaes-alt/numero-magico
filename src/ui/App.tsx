import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, RotateCcw, ShieldAlert } from 'lucide-react';
import { useUniverse } from './data';
import { FixedIncomeCompare } from './components/FixedIncomeCompare';
import { MonteCarloPanel } from './components/MonteCarloPanel';
import { StressTests } from './components/StressTests';
import { SavedScenarios, loadBrand } from './components/SavedScenarios';
import { simulate, type SimulationResult } from '../engine';
import { ASSETS, DEFAULT_TICKER, formatCnpj, officialSources } from '../assets/registry';
import { advancedDefaults, demoParams, inputForTab, type MainTab } from '../scenarios/defaults';
import { marketApi, MarketApiError } from '../market/client';
import { defaultDividend, type MarketSnapshot, type MarketStatus } from '../market/types';
import { formFromParams, paramsFromForm, toBR, type FormField, type FormState } from './form';
import { load, loadRaw, save } from './storage';
import { Field } from './components/Field';
import { AdvancedParams } from './components/AdvancedParams';
import { MagicCards } from './components/MagicCards';
import { ExecutiveSummary, GoalBanner } from './components/Summary';
import { ChartsPanel, type ChartKey } from './components/Charts';
import { DataTable } from './components/DataTable';
import { MarketPanel } from './components/MarketPanel';
import { ScenarioLab } from './components/ScenarioLab';
import { StrategyCompare } from './components/StrategyCompare';
import { ExportBar } from './components/ExportBar';
import { DISCLAIMER, LIMITATIONS, TAB_LABEL, reportMeta } from './report';
import { fmtBRL, yearsMonthsLabel } from './format';
import { decodeShare, encodeShare } from './share';

type Mode = 'demo' | 'market';
type Status = 'demo' | 'market' | 'custom';
interface Prefs { mode: Mode; status: Status; tab: MainTab; marketLabel: string; ticker: string }

const DEFAULT_PREFS: Prefs = { mode: 'demo', status: 'demo', tab: 'nominal', marketLabel: '', ticker: DEFAULT_TICKER };
const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;
const validPrefs = (p: Prefs) => (Object.hasOwn(ASSETS, p.ticker) || TICKER_RE.test(p.ticker)) && ['nominal', 'inflacao', 'aportes'].includes(p.tab)
  && ['demo', 'market'].includes(p.mode) && ['demo', 'market', 'custom'].includes(p.status);
const TABS: { id: MainTab; label: string; charts: ChartKey[] }[] = [
  { id: 'nominal', label: 'Nominal', charts: ['equity', 'shares', 'income', 'cumDividends', 'incomeVsGoal'] },
  { id: 'inflacao', label: 'Inflação', charts: ['nominalVsReal', 'income', 'equity', 'shares', 'cumDividends', 'incomeVsGoal'] },
  { id: 'aportes', label: 'Aportes mensais', charts: ['investedVsEquity', 'nominalVsReal', 'shares', 'income', 'cumDividends', 'incomeVsGoal'] },
];

const HELP: Partial<Record<FormField, string>> = {
  price: 'Preço de uma cota em reais. No modo de mercado, o último preço negociado.',
  dividend: 'Rendimento mensal distribuído por cota. Aceita 3 ou mais casas decimais (ex.: 0,095).',
  desiredShares: 'Quantas cotas você quer comprar por mês somente com os dividendos. Define o número mágico.',
  inflationPct: 'Inflação anual usada para calcular valores reais e reajustar o aporte uma vez por ano.',
  contribution: 'Aporte mensal da aba "Aportes mensais", a partir do mês 2, reajustado a cada 12 meses pela inflação.',
  incomeGoal: 'Renda mensal desejada. A meta é atingida no primeiro mês em que a renda das cotas no início do mês a iguala ou supera.',
};

export function SimulatorPage({ requestedTicker }: { requestedTicker?: string | null }) {
  const universe = useUniverse();
  const shared = useMemo(() => (typeof window === 'undefined' ? null : decodeShare(window.location.search, formFromParams(demoParams(DEFAULT_TICKER)))), []);
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = load('mxrf:prefs', DEFAULT_PREFS, validPrefs);
    if (shared && (Object.hasOwn(ASSETS, shared.ticker) || TICKER_RE.test(shared.ticker))) return { ...p, ticker: shared.ticker, tab: shared.tab, status: 'custom', mode: ASSETS[shared.ticker]?.demo ? 'demo' : 'market' };
    return p;
  });
  const TICKER = prefs.ticker;
  const hasDemo = Boolean(ASSETS[TICKER]?.demo);
  const [form, setForm] = useState<FormState>(() => (shared && (Object.hasOwn(ASSETS, shared.ticker) || TICKER_RE.test(shared.ticker)) ? shared.form : load('mxrf:form', formFromParams(demoParams(TICKER)))));
  const [copied, setCopied] = useState(false);
  const shareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeShare({ ticker: TICKER, tab: prefs.tab, form })}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt('Copie o link do cenário:', url); }
  };
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [localSnap, setLocalSnap] = useState<MarketSnapshot | null>(() => loadRaw(`mxrf:manualSnapshot:${load('mxrf:prefs', DEFAULT_PREFS, validPrefs).ticker}`, null));
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState<string | null>(null);

  useEffect(() => save('mxrf:prefs', prefs), [prefs]);
  const statusRef = useRef(prefs.status);
  statusRef.current = prefs.status;
  const tickerRef = useRef(prefs.ticker);
  tickerRef.current = prefs.ticker;
  const localSnapRef = useRef(localSnap);
  localSnapRef.current = localSnap;
  useEffect(() => save('mxrf:form', form), [form]);

  const { params: liveParams, errors } = useMemo(() => paramsFromForm(form, TICKER), [form, TICKER]);
  // com campo inválido, mantém o último resultado válido (esmaecido) em vez de apagar a tela
  const lastValid = useRef(liveParams);
  if (liveParams) lastValid.current = liveParams;
  const params = liveParams ?? lastValid.current;
  const showingStale = !liveParams && Boolean(params);
  const deferredParams = useDeferredValue(params);

  const results = useMemo(() => {
    if (!deferredParams) return null;
    // Nominal e Inflação usam a mesma entrada (a aba Inflação só exibe as colunas reais): uma simulação basta.
    const nominal = simulate(inputForTab(deferredParams, 'nominal'));
    return { nominal, inflacao: nominal, aportes: simulate(inputForTab(deferredParams, 'aportes')) } as Record<MainTab, SimulationResult>;
  }, [deferredParams]);
  const tabResult = results?.[prefs.tab] ?? null;

  const statusLabel = prefs.status === 'custom' ? 'Cenário personalizado'
    : prefs.status === 'market' ? `Dados de mercado · ${prefs.marketLabel}`
    : prefs.mode === 'market' ? 'Sem cotação — usando valores de exemplo'
    : 'Exemplo didático (não é cotação)';
  const statusTone = prefs.status === 'custom' ? 'bg-gold-500/10 text-gold-300 ring-gold-500/30'
    : prefs.status === 'market' ? 'bg-gain-500/10 text-gain-400 ring-gain-500/30'
    : prefs.mode === 'market' ? 'bg-loss-500/10 text-loss-400 ring-loss-500/30'
    : 'bg-ink-800 text-mist-300 ring-white/10';

  const edit = (k: keyof FormState) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPrefs((p) => ({ ...p, status: 'custom' }));
  };

  const applySnapshot = useCallback((s: MarketSnapshot) => {
    const div = defaultDividend(s);
    if (!s.lastTrade || !div || s.ticker !== tickerRef.current) return; // nunca aplica dados de outro ativo
    const pay = div.event.paymentDate.slice(0, 7);
    setForm((f) => ({
      ...f,
      price: toBR(s.lastTrade!.price),
      dividend: toBR(div.event.amountPerShare),
      // o 1º pagamento simulado é o do rendimento usado; prazo = observado no aviso oficial
      startMonth: /^\d{4}-\d{2}$/.test(pay) ? pay : f.startMonth,
      paymentLag: s.paymentLagBusinessDays !== undefined ? String(s.paymentLagBusinessDays) : f.paymentLag,
    }));
    const session = s.lastTrade.sessionDate ?? s.lastTrade.tradedAt.slice(0, 10);
    const [y, m, d] = session.split('-');
    const divLabel = div.event.estimated === 'cvm' ? 'rendimento estimado (CVM)' : div.event.estimated === 'media12m' ? 'média mensal de proventos 12m' : `rendimento ${div.kind}`;
    const label = `${s.ticker} · ${s.lastTrade.kind === 'fechamento' ? 'fechamento' : 'preço'} de ${d}/${m}/${y} · ${divLabel}`;
    setPrefs((p) => ({ ...p, status: 'market', mode: 'market', marketLabel: label }));
  }, []);

  const loadMarket = useCallback(async (refresh: boolean) => {
    setMLoading(true); setMError(null);
    try {
      const st = refresh ? await marketApi.refresh(TICKER) : await marketApi.status(TICKER);
      if (st.ticker !== tickerRef.current) return null; // resposta de um ativo anterior: descarta
      setMarket(st);
      return st;
    } catch (e) {
      setMError(e instanceof MarketApiError ? e.message : 'Falha ao consultar dados de mercado.');
      return null;
    } finally { setMLoading(false); }
  }, [TICKER]);

  // Ao entrar no modo de mercado: consulta e aplica automaticamente, exceto sobre cenário personalizado.
  useEffect(() => {
    if (prefs.mode !== 'market') return;
    let cancelled = false;
    loadMarket(false).then((st) => {
      if (cancelled) return;
      const snap = st?.snapshot ?? localSnapRef.current;
      if (snap && statusRef.current !== 'custom') applySnapshot(snap);
    });
    return () => { cancelled = true; };
  }, [prefs.mode, loadMarket, applySnapshot]); // loadMarket muda junto com o ativo

  const setMode = (m: Mode) => {
    if (m === 'demo' && !hasDemo) return;
    if (m === 'demo') {
      setForm((f) => ({ ...formFromParams(demoParams(TICKER)), contribution: f.contribution, incomeGoal: f.incomeGoal, incomeGoalBasis: f.incomeGoalBasis, inflationPct: f.inflationPct }));
      setPrefs((p) => ({ ...p, mode: 'demo', status: 'demo' }));
    } else {
      setPrefs((p) => ({ ...p, mode: 'market', status: p.status === 'custom' ? 'custom' : 'demo' }));
    }
  };

  const restore = () => {
    setForm(formFromParams(demoParams(DEFAULT_TICKER)));
    setPrefs({ ...DEFAULT_PREFS, tab: prefs.tab });
  };

  const setTicker = (t: string) => {
    if (t === TICKER || !(Object.hasOwn(ASSETS, t) || TICKER_RE.test(t))) return;
    const demo = Boolean(ASSETS[t]?.demo);
    setMarket(null);
    setLocalSnap(loadRaw(`mxrf:manualSnapshot:${t}`, null));
    setForm((f) => (demo ? { ...formFromParams(demoParams(t)), contribution: f.contribution, incomeGoal: f.incomeGoal, incomeGoalBasis: f.incomeGoalBasis } : { ...f, ...formFromParams({ ...demoParams(t), ...advancedDefaults(t), monthlyContribution: '250', incomeGoal: '1000' }), contribution: f.contribution, incomeGoal: f.incomeGoal, incomeGoalBasis: f.incomeGoalBasis }));
    setPrefs((p) => ({ ...p, ticker: t, mode: demo ? p.mode : 'market', status: 'demo', marketLabel: '' }));
  };

  // abertura a partir do Explorador/Carteira (#/simulador?t=XXXX11)
  const setTickerRef = useRef(setTicker);
  setTickerRef.current = setTicker;
  useEffect(() => {
    if (requestedTicker && TICKER_RE.test(requestedTicker)) setTickerRef.current(requestedTicker);
  }, [requestedTicker]);

  const showReal = prefs.tab !== 'nominal';
  const aportesGoal = results?.aportes.summary.goalMonth ?? null;
  const goalHint = prefs.tab !== 'aportes' && aportesGoal
    ? `Com aportes de ${fmtBRL(results!.aportes.input.monthlyContribution)}/mês (aba Aportes mensais), a meta é atingida no mês ${aportesGoal} — ${yearsMonthsLabel(aportesGoal)}.`
    : undefined;
  const showContrib = prefs.tab === 'aportes';
  const tabDef = TABS.find((t) => t.id === prefs.tab)!;
  const uMetrics = universe.data?.assets.find((a) => a.ticker === TICKER);
  const stocks = useMemo(() => (universe.data?.assets ?? []).filter((a) => a.cls === 'ACAO' && a.dy12m).sort((a, b) => a.ticker.localeCompare(b.ticker)), [universe.data]);
  const otherFunds = useMemo(() => (universe.data?.assets ?? []).filter((a) => (a.cls === 'FII' || a.cls === 'FIAGRO') && a.cnpj && !Object.hasOwn(ASSETS, a.ticker)).sort((a, b) => a.ticker.localeCompare(b.ticker)), [universe.data]);
  const asset = Object.hasOwn(ASSETS, TICKER) ? ASSETS[TICKER] : { ticker: TICKER, name: uMetrics?.name ?? 'Fundo listado', cnpj: uMetrics?.cnpj ?? '' };

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-mist-100">{asset.ticker} <span className="text-mist-400">· {asset.name}</span></p>
          <p className="text-[11px] text-mist-500">{asset.cnpj ? `CNPJ ${formatCnpj(asset.cnpj)} · ` : ''}Simulador de reinvestimento de rendimentos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="ticker">Ativo</label>
          <select id="ticker" data-testid="ticker" className="input !w-auto !py-1.5 text-xs" value={TICKER} onChange={(e) => setTicker(e.target.value)}>
            <optgroup label="Cadastro verificado">
              {Object.values(ASSETS).map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
            </optgroup>
            {otherFunds.length > 0 && (
              <optgroup label="Outros FIIs e Fiagros (dados oficiais)">
                {otherFunds.map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
              </optgroup>
            )}
            {stocks.length > 0 && (
              <optgroup label="Ações com proventos (média mensal de 12 meses)">
                {stocks.map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
              </optgroup>
            )}
            {!Object.hasOwn(ASSETS, TICKER) && !otherFunds.some((a) => a.ticker === TICKER) && !stocks.some((a) => a.ticker === TICKER) && <option value={TICKER}>{TICKER}</option>}
          </select>
          <div className="seg" role="group" aria-label="Origem dos dados">
            <button type="button" aria-pressed={prefs.mode === 'demo'} disabled={!hasDemo} title={hasDemo ? undefined : 'O exemplo didático existe apenas para o MXRF11'} onClick={() => setMode('demo')} className="disabled:opacity-40">Demonstração</button>
            <button type="button" aria-pressed={prefs.mode === 'market'} onClick={() => setMode('market')}>Dados de mercado</button>
          </div>
          <span data-testid="status-badge" className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${statusTone}`}>
            {statusLabel}
          </span>
          <button type="button" className="btn" onClick={restore} data-testid="restore"><RotateCcw size={14} aria-hidden />Restaurar padrão</button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {tabResult?.magic.finite && (
          <a href="#magic-title" data-testid="mobile-strip" className="no-print card flex items-center justify-between gap-3 p-4 sm:hidden">
            <span className="text-xs text-mist-400">Número mágico<br /><span className="num text-2xl font-semibold text-gold-300">{tabResult.magic.shares} cotas</span></span>
            <span className="text-right text-xs text-mist-400">Investimento inicial<br /><span className="num text-lg font-semibold text-mist-100">{fmtBRL(tabResult.magic.initialInvestment)}</span></span>
          </a>
        )}
        {prefs.mode === 'demo' && hasDemo && prefs.status === 'demo' && (
          <p className="no-print rounded-lg bg-ink-850 p-3 text-xs text-mist-400 ring-1 ring-white/5">
            Modo Demonstração: valores do exemplo didático (preço R$ 8,89, dividendo R$ 0,10). <strong className="text-mist-200">Não são cotações reais</strong> — para dados oficiais da B3 e do Fundos.NET, use “Dados de mercado”.
          </p>
        )}
        {prefs.mode === 'market' && (
          <div className="no-print">
            <MarketPanel key={TICKER} ticker={TICKER} status={market} localSnapshot={localSnap} loading={mLoading} error={mError} isCustom={prefs.status === 'custom'}
              onRefresh={() => loadMarket(true).then((st) => { if (st?.snapshot && prefs.status === 'market') applySnapshot(st.snapshot); })}
              onApply={applySnapshot}
              onSaveLocal={(s) => { setLocalSnap(s); save(`mxrf:manualSnapshot:${TICKER}`, s); applySnapshot(s); }} />
          </div>
        )}

        <section id="simulador" aria-label="Parâmetros" className="no-print card grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-7">
          <Field label="Preço da cota" prefix="R$" value={form.price} onChange={edit('price')} error={errors.price} help={HELP.price} testId="in-price" />
          <Field label="Dividendo/cota" prefix="R$" value={form.dividend} onChange={edit('dividend')} error={errors.dividend} help={HELP.dividend} testId="in-dividend" />
          <Field label="Cotas desejadas/mês" value={form.desiredShares} onChange={edit('desiredShares')} error={errors.desiredShares} help={HELP.desiredShares} inputMode="numeric" testId="in-desired" />
          <Field label="Inflação anual" suffix="%" value={form.inflationPct} onChange={edit('inflationPct')} error={errors.inflationPct} help={HELP.inflationPct} testId="in-inflation" />
          <Field label="Aporte mensal (aba Aportes)" prefix="R$" value={form.contribution} onChange={edit('contribution')} error={errors.contribution} help={HELP.contribution} testId="in-contribution" />
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

        <AdvancedParams form={form} errors={errors} edit={edit} />

        {!liveParams && (
          <div role="alert" className="card flex items-center gap-2 p-4 text-sm text-loss-400"><ShieldAlert size={16} aria-hidden />{showingStale ? 'Corrija os parâmetros destacados. Exibindo o último resultado válido.' : 'Corrija os parâmetros destacados para recalcular a simulação.'}</div>
        )}

        <div className={showingStale ? 'pointer-events-none opacity-50 transition-opacity' : 'contents'} aria-hidden={showingStale || undefined}>
        {tabResult && <MagicCards magic={tabResult.magic} desired={tabResult.input.desiredShares} />}
        {tabResult?.magic.finite && <p className="-mt-3 text-[11px] text-mist-500">Cenário hipotético com preço e dividendo constantes. Resultados projetados não são garantia de renda futura e não constituem recomendação de investimento.</p>}

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
              <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn" data-testid="share" onClick={shareLink} aria-live="polite">
                <Link2 size={14} aria-hidden />{copied ? 'Link copiado!' : 'Copiar link do cenário'}
              </button>
              <ExportBar result={tabResult} includeReal={showReal} fileBase={`${TICKER.toLowerCase()}-${prefs.tab}-360m`} meta={reportMeta(tabResult, prefs.tab, statusLabel, TICKER)} />
              </div>
            </div>

            <SavedScenarios current={{ ticker: TICKER, tab: prefs.tab, form }} onLoad={(sc) => {
              if (sc.ticker !== TICKER) setTicker(sc.ticker);
              setForm({ ...formFromParams(demoParams(DEFAULT_TICKER)), ...sc.form });
              setPrefs((p) => ({ ...p, ticker: sc.ticker, tab: sc.tab, status: 'custom' }));
            }} />
            <div className="print-only text-xs">
              {(() => { const b = loadBrand(); return b.name || b.logo ? <div className="mb-3 flex items-center gap-3 border-b pb-2">{b.logo && <img src={b.logo} alt="" className="h-10" />}<strong className="text-base">{b.name}</strong></div> : null; })()}
              {reportMeta(tabResult, prefs.tab, statusLabel, TICKER).map((l) => <p key={l} className="mb-1">{l}</p>)}
            </div>

            <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${prefs.tab}`} className="flex flex-col gap-6">
              <p className="text-xs text-mist-400">
                {prefs.tab === 'nominal' && 'Investimento inicial único, sem aportes, preço e dividendo constantes, reinvestimento integral dos dividendos.'}
                {prefs.tab === 'inflacao' && 'Mesma simulação nominal, com valores reais: valor real(t) = nominal(t) / (1 + inflação)^(t/12), mês 0 como data-base.'}
                {prefs.tab === 'aportes' && 'Começa com o número mágico; aportes a partir do mês 2, reajustados pela inflação a cada 12 meses (meses 13, 25, 37…).'}
              </p>
              <GoalBanner result={tabResult} hint={goalHint} />
              <ExecutiveSummary result={tabResult} showReal={showReal} showContrib={showContrib} />
              <ChartsPanel result={tabResult} charts={tabDef.charts} testId="charts" showReal={showReal} />
              <DataTable result={tabResult} showReal={showReal} showContrib={showContrib} />
            </div>

            <div className="no-print flex flex-col gap-10 border-t border-white/5 pt-8">
              <FixedIncomeCompare result={tabResult} />
              <StressTests result={tabResult} />
              <MonteCarloPanel key={`${TICKER}-${uMetrics?.vol12m ?? ''}`} result={tabResult} histVol={uMetrics?.vol12m ?? null} />
              <StrategyCompare base={tabResult.input} />
              <ScenarioLab base={tabResult.input} />
            </div>
          </>
        )}
        </div>
      </div>

      <section aria-label="Premissas e fontes" className="flex flex-col gap-3 border-t border-white/5 pt-6 text-xs text-mist-500">
        <p className="print-only">{DISCLAIMER}</p>
        <details className="no-print">
          <summary className="cursor-pointer text-mist-400 hover:text-gold-300">Premissas do modelo</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
        <p>Aba atual: {TAB_LABEL[prefs.tab]} · Fontes oficiais para conferência: {officialSources(asset).map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a className="underline hover:text-gold-300" href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a></span>)}</p>
      </section>
    </div>
  );
}
