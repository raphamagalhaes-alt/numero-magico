import { useEffect, useMemo, useState } from 'react';
import { Bell, Calculator, PiggyBank, Plus, Trash2, Wallet } from 'lucide-react';
import { magicNumber } from '../../engine';
import { idealByClass, planContribution } from '../../engine/freedom';
import { EXAMPLE, type ExampleClass } from '../../markets/example';
import type { AssetMetrics } from '../../market/universe';
import { invalidateData, useUniverse } from '../data';
import { fmtBRL, fmtDecimal, fmtInt, fmtPct } from '../format';
import { go } from '../route';
import { loadRaw, save } from '../storage';
import { AlertChannels } from '../components/AlertChannels';
import { FixedIncomeCheck, IncomeCalendar } from '../components/IncomeInsights';
import { AmountWords, NumInput } from '../components/NumInput';
import { parseNum } from '../numfmt';

export interface Position { ticker: string; shares: number }
export const POS_KEY = 'mxrf:positions';
const SEEN_KEY = 'mxrf:seenDividends';

export function loadPositions(): Position[] {
  const v = loadRaw<unknown>(POS_KEY, []);
  return Array.isArray(v) ? v.filter((p): p is Position => !!p && typeof p.ticker === 'string' && Number.isInteger(p.shares) && p.shares >= 0).slice(0, 50) : [];
}

/** Rendimentos anunciados desde a última visita para os ativos da carteira. */
export function newDividendAlerts(positions: Position[], assets: AssetMetrics[]): { ticker: string; amount: number; recordDate: string; paymentDate: string }[] {
  const seen = loadRaw<Record<string, string>>(SEEN_KEY, {});
  const out = [];
  for (const p of positions) {
    const a = assets.find((x) => x.ticker === p.ticker);
    const d = a?.lastDividend;
    if (d && (!seen[p.ticker] || d.recordDate > seen[p.ticker])) out.push({ ticker: p.ticker, ...d });
  }
  return out;
}
export function markDividendsSeen(assets: AssetMetrics[], positions: Position[]) {
  const seen = loadRaw<Record<string, string>>(SEEN_KEY, {});
  for (const p of positions) { const d = assets.find((x) => x.ticker === p.ticker)?.lastDividend; if (d) seen[p.ticker] = d.recordDate; }
  save(SEEN_KEY, seen);
}

/** Renda mensal estimada por cota: FII = último rendimento; ação = média mensal dos proventos de 12 meses. */
export function monthlyIncomePerShare(a: AssetMetrics | undefined): number {
  if (!a) return 0;
  return a.cls === 'ACAO' ? (a.dy12m ? Math.trunc((a.dy12m * a.close / 12) * 1e6) / 1e6 : 0) : a.lastDividend?.amount ?? 0;
}
/** Valor e renda mensal estimada da carteira inteira (usado também na página Liberdade). */
export function portfolioTotals(positions: Position[], assets: AssetMetrics[]) {
  let value = 0, income = 0;
  for (const p of positions) {
    const a = assets.find((x) => x.ticker === p.ticker);
    if (!a) continue;
    value += a.close * p.shares;
    income += Math.round(monthlyIncomePerShare(a) * p.shares * 100) / 100;
  }
  return { value: Math.round(value * 100) / 100, income: Math.round(income * 100) / 100 };
}

export const TARGET_KEY = 'mxrf:targets';
const CLASS_LABEL: Record<ExampleClass, string> = { acoes: 'Ações Brasil', fiis: 'Fundos imobiliários', tesouro: 'Tesouro / renda fixa', exterior: 'Ações exterior', etfs: 'ETFs internacionais', cripto: 'Criptomoedas' };
const CRYPTO = new Set(['QBTC11', 'BITH11', 'HASH11', 'ETHE11', 'QETH11', 'BITI11', 'BITC11', 'ETHY11', 'IBIT39', 'BITO39', 'ETHA39']);
const BR_INDEX_ETF = new Set(['BOVA11', 'BOVV11', 'BOVX11', 'SMAL11', 'DIVO11', 'BRAX11', 'ECOO11', 'PIBB11']);
/** Classe de um ativo para a divisão por classes. */
export function classOf(a: AssetMetrics): ExampleClass {
  if (CRYPTO.has(a.ticker)) return 'cripto';
  if (a.cls === 'FII' || a.cls === 'FIAGRO') return 'fiis';
  if (a.cls === 'BDR') return /39$/.test(a.ticker) ? 'etfs' : 'exterior';
  if (a.cls === 'ETF') return BR_INDEX_ETF.has(a.ticker) ? 'acoes' : 'etfs';
  return 'acoes';
}
const DEFAULT_CLASSES = Object.fromEntries(EXAMPLE.map((g) => [g.id, String(g.pct)])) as Record<ExampleClass, string>;

/** Aporte do mês: quantas cotas inteiras comprar de cada ativo para chegar perto da divisão que a pessoa escolheu. */
function MonthlyContribution({ positions, assets }: { positions: Position[]; assets: AssetMetrics[] }) {
  const [cash, setCash] = useState('500');
  const [targets, setTargets] = useState<Record<string, string>>(() => loadRaw<Record<string, string>>(TARGET_KEY, {}));
  useEffect(() => save(TARGET_KEY, targets), [targets]);
  const rows = positions.map((p) => ({ p, a: assets.find((x) => x.ticker === p.ticker) })).filter((r) => r.a && r.a.close > 0);
  const num = (s: string | undefined) => { const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const holdings = rows.map(({ p, a }) => ({ ticker: p.ticker, shares: p.shares, price: a!.close, target: num(targets[p.ticker] ?? '1') }));
  const money = num(cash);
  const [mode, setMode] = useState<'ativo' | 'classes'>(() => loadRaw<'ativo' | 'classes'>('mxrf:contribMode', 'ativo'));
  const [classPct, setClassPct] = useState<Record<ExampleClass, string>>(() => {
    const v = loadRaw<Partial<Record<ExampleClass, number | string>>>('mxrf:classTargets', {});
    return Object.fromEntries(Object.keys(DEFAULT_CLASSES).map((k) => [k, v[k as ExampleClass] !== undefined ? String(v[k as ExampleClass]) : DEFAULT_CLASSES[k as ExampleClass]])) as Record<ExampleClass, string>;
  });
  const [fixedHave, setFixedHave] = useState(() => loadRaw<string>('mxrf:fixedHave', '0'));
  useEffect(() => save('mxrf:contribMode', mode), [mode]);
  useEffect(() => save('mxrf:classTargets', Object.fromEntries(Object.entries(classPct).map(([k, v]) => [k, num(v)]))), [classPct]);
  useEffect(() => save('mxrf:fixedHave', fixedHave), [fixedHave]);
  const byClass = mode === 'classes';
  const cls = (t: string) => classOf(rows.find((r) => r.p.ticker === t)!.a!);
  const pcts = Object.fromEntries(Object.entries(classPct).map(([k, v]) => [k, num(v)])) as Record<ExampleClass, number>;
  const ideal = idealByClass(holdings.map((h) => ({ ticker: h.ticker, cls: cls(h.ticker) })), pcts);
  const fixedValue = num(fixedHave);
  const used = new Set(holdings.map((h) => cls(h.ticker)));
  const missing = (Object.keys(pcts) as ExampleClass[]).filter((k) => k !== 'tesouro' && pcts[k] > 0 && !used.has(k));
  const pctSum = (Object.keys(pcts) as ExampleClass[]).filter((k) => k === 'tesouro' || used.has(k)).reduce((s2, k) => s2 + pcts[k], 0);
  const hold2 = byClass ? holdings.map((h) => ({ ...h, target: ideal[h.ticker] * 100 })) : holdings;
  const plan = byClass ? planContribution(hold2, money, { value: fixedValue, target: pcts.tesouro }) : planContribution(holdings, money);
  const tsum = hold2.reduce((s2, h) => s2 + h.target, 0) + (byClass ? pcts.tesouro : 0);
  const totalNow = hold2.reduce((s2, x) => s2 + x.shares * x.price, 0) + (byClass ? fixedValue : 0);
  if (!rows.length) return null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="ap-title" data-testid="pf-contrib">
      <div>
        <h2 id="ap-title" className="flex items-center gap-2 text-base font-semibold"><PiggyBank size={16} className="text-gold-400" aria-hidden />Aporte do mês</h2>
        <p className="text-xs text-mist-400">Diga quanto vai investir e a divisão que <b>você</b> quer (pesos). Calculamos quantas cotas inteiras comprar de cada um para chegar mais perto dessa divisão, sem vender nada.</p>
      </div>
      <div className="seg self-start" role="group" aria-label="Como dividir">
        <button type="button" aria-pressed={!byClass} onClick={() => setMode('ativo')}>Peso por ativo</button>
        <button type="button" aria-pressed={byClass} onClick={() => setMode('classes')} data-testid="ap-mode-classes">Divisão por classes</button>
      </div>
      {byClass && (
        <div className="flex flex-col gap-2 rounded-lg bg-ink-850 p-3" data-testid="ap-classes">
          <p className="text-xs text-mist-400">% de cada classe na sua carteira. O % ideal de cada ativo é o % da classe dividido igualmente entre os ativos dela.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(CLASS_LABEL) as ExampleClass[]).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-[11px] text-mist-400">{CLASS_LABEL[k]} (%)<NumInput className="input num !py-1" value={classPct[k]} onChange={(e) => setClassPct((c) => ({ ...c, [k]: e.target.value }))} data-testid={`ap-pct-${k}`} /></label>
            ))}
          </div>
          <label className="flex max-w-xs flex-col gap-1 text-[11px] text-mist-400">Quanto já tenho em Tesouro / renda fixa (R$)<NumInput className="input num !py-1" value={fixedHave} onChange={(e) => setFixedHave(e.target.value)} data-testid="ap-fixed" /><AmountWords value={fixedHave} /></label>
          {Math.round(pctSum) !== 100 && <p className="text-[11px] text-gold-300">As classes que você tem somam {pctSum.toLocaleString('pt-BR')}%; os alvos são ajustados proporcionalmente.</p>}
          {missing.length > 0 && <p className="text-[11px] text-mist-500">Sem ativos na Carteira para: {missing.map((k) => CLASS_LABEL[k]).join(', ')} — esses % ficam de fora até você adicionar algum ativo dessas classes.</p>}
        </div>
      )}
      <label className="flex max-w-xs flex-col gap-1 text-xs text-mist-400">Quanto vou investir agora (R$)<NumInput className="input num" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} data-testid="ap-cash" /><AmountWords value={cash} /></label>
      <div className="overflow-x-auto">
        <table className="num w-full text-xs">
          <thead><tr className="text-mist-400">{(byClass ? ['Ativo', 'Classe', '% carteira', '% ideal', 'Comprar?', 'Comprar', 'Custo', 'Depois'] : ['Ativo', 'Peso que eu quero', 'Hoje', 'Alvo', 'Comprar', 'Custo', 'Depois']).map((h, i) => <th key={h} scope="col" className={`px-2 py-1.5 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>{byClass && (
            <tr className="border-t border-white/5" data-ticker="renda-fixa">
              <th scope="row" className="px-2 py-1.5 text-left font-medium">Tesouro / renda fixa</th>
              <td className="px-2 py-1.5 text-right text-mist-400">Renda fixa</td>
              <td className="px-2 py-1.5 text-right">{totalNow ? fmtPct(fixedValue / totalNow, 2) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{tsum ? fmtPct(pcts.tesouro / tsum, 2) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{tsum && pcts.tesouro > 0 ? ((totalNow ? fixedValue / totalNow : 0) < pcts.tesouro / tsum - 1e-9 ? <span className="text-gain-400">Sim</span> : <span className="text-mist-500">Não</span>) : '—'}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gold-300">{plan.fixedBuy ? `aplicar ${fmtBRL(plan.fixedBuy.toFixed(2))}` : '—'}</td>
              <td className="px-2 py-1.5 text-right">{plan.fixedBuy ? fmtBRL(plan.fixedBuy.toFixed(2)) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{fmtPct(plan.fixedAfter, 1)}</td>
            </tr>
          )}{hold2.map((h) => {
            const buy = plan.buys.find((b) => b.ticker === h.ticker);
            const aft = plan.after.find((x) => x.ticker === h.ticker)!;
            const now = totalNow ? h.shares * h.price / totalNow : 0;
            const idealPct = tsum ? h.target / tsum : 0;
            if (byClass) return (
              <tr key={h.ticker} className="border-t border-white/5" data-ticker={h.ticker}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium">{h.ticker}</th>
                <td className="px-2 py-1.5 text-right text-mist-400">{CLASS_LABEL[cls(h.ticker)]}</td>
                <td className="px-2 py-1.5 text-right">{fmtPct(now, 2)}</td>
                <td className="px-2 py-1.5 text-right">{fmtPct(idealPct, 2)}</td>
                <td className="px-2 py-1.5 text-right" data-testid="ap-buy-flag">{now < idealPct - 1e-9 ? <span className="text-gain-400">Sim</span> : <span className="text-mist-500">Não</span>}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-gold-300">{buy ? `${fmtInt(buy.shares)} cota${buy.shares > 1 ? 's' : ''}` : '—'}</td>
                <td className="px-2 py-1.5 text-right">{buy ? fmtBRL(buy.cost.toFixed(2)) : '—'}</td>
                <td className="px-2 py-1.5 text-right">{fmtPct(aft.weight, 1)}</td>
              </tr>
            );
            return (
              <tr key={h.ticker} className="border-t border-white/5" data-ticker={h.ticker}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium">{h.ticker}</th>
                <td className="px-2 py-1.5 text-right"><NumInput className="input num w-16 !py-1 text-right" inputMode="decimal" aria-label={`Peso de ${h.ticker}`} value={targets[h.ticker] ?? '1'} onChange={(e) => setTargets((t) => ({ ...t, [h.ticker]: e.target.value }))} /></td>
                <td className="px-2 py-1.5 text-right">{totalNow ? fmtPct(h.shares * h.price / totalNow, 0) : '—'}</td>
                <td className="px-2 py-1.5 text-right">{tsum ? fmtPct(h.target / tsum, 0) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-gold-300">{buy ? `${fmtInt(buy.shares)} cota${buy.shares > 1 ? 's' : ''}` : '—'}</td>
                <td className="px-2 py-1.5 text-right">{buy ? fmtBRL(buy.cost.toFixed(2)) : '—'}</td>
                <td className="px-2 py-1.5 text-right">{fmtPct(aft.weight, 0)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="text-xs text-mist-300" data-testid="ap-summary">{plan.buys.length || plan.fixedBuy ? <>{plan.fixedBuy ? <>Aplicar em renda fixa: <b>{fmtBRL(plan.fixedBuy.toFixed(2))}</b> · </> : null}Total a comprar: <b>{fmtBRL(plan.spent.toFixed(2))}</b> · sobra {fmtBRL(plan.leftover.toFixed(2))} (fica para o próximo mês).</> : 'Com esse valor não dá para comprar uma cota inteira que aproxime da divisão escolhida.'}</p>
      <p className="text-[11px] text-mist-500">A divisão é escolha sua; o cálculo só faz a conta. Preços do último fechamento disponível — confira na corretora antes de comprar. Não é recomendação.</p>
    </section>
  );
}

export function PortfolioPage() {
  const u = useUniverse();
  const [positions, setPositions] = useState<Position[]>(loadPositions);
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [desired, setDesired] = useState('1');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => save(POS_KEY, positions), [positions]);
  const assets = useMemo(() => u.data?.assets ?? [], [u.data]);
  const alerts = useMemo(() => newDividendAlerts(positions, assets), [positions, assets]);

  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    const n = parseNum(shares) ?? NaN;
    if (!/^[A-Z0-9]{4}\d{1,2}$/.test(t)) return setErr('Informe o código do ativo (ex.: PETR4, MXRF11, AAPL34).');
    if (!Number.isInteger(n) || n < 0) return setErr('Informe um número inteiro de cotas.');
    if (!assets.some((a) => a.ticker === t)) {
      // ainda sem cotação neste aparelho: busca agora (com a chave da brapi, no site)
      setErr(null); setBusy(true);
      const st = await fetch(`/api/market/${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { snapshot?: unknown } | null;
      setBusy(false);
      if (!st?.snapshot) return setErr(`Não encontramos cotação para ${t}. Confira o código ou ative suas cotações (chave grátis da brapi) em Mercados.`);
      invalidateData();
    }
    setErr(null);
    setPositions((p) => [...p.filter((x) => x.ticker !== t), { ticker: t, shares: n }].sort((a, b) => a.ticker.localeCompare(b.ticker)));
    // limpa só se a pessoa não começou a digitar outro ativo enquanto buscávamos
    setTicker((cur) => (cur.trim().toUpperCase() === t ? '' : cur)); setShares((cur) => (cur === shares ? '' : cur));
  };
  const notify = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted' && alerts.length) new Notification('Novos rendimentos anunciados', { body: alerts.map((a) => `${a.ticker}: R$ ${fmtDecimal(a.amount, 3)}`).join(' · ') });
  };
  const k = Math.max(1, Math.floor(parseNum(desired) ?? 1) || 1);
  let totalValue = 0, totalIncome = 0;

  return (
    <section aria-labelledby="pf-title" className="flex flex-col gap-4">
      <div>
        <h1 id="pf-title" className="flex items-center gap-2 text-xl font-semibold"><Wallet size={20} className="text-gold-400" aria-hidden />Minha carteira</h1>
        <p className="text-sm text-mist-400">Informe quantas cotas você já tem. Mostramos o quanto falta para o número mágico de cada fundo com o último rendimento oficial, e avisamos quando sair um novo aviso de rendimento. Os dados ficam apenas neste navegador. Antes de comprar ou vender, anote o motivo no <button type="button" className="underline hover:text-gold-300" onClick={() => go('diario')}>Diário de decisões</button>.</p>
      </div>
      {alerts.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 p-4 ring-gold-500/40" role="status" data-testid="pf-alerts">
          <Bell size={18} className="text-gold-400" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-medium text-gold-300">Novos rendimentos anunciados desde sua última visita</p>
            <ul className="text-xs text-mist-300">{alerts.map((a) => <li key={a.ticker}>{a.ticker}: R$ {fmtDecimal(a.amount, Math.max(2, String(a.amount).split('.')[1]?.length ?? 0))} por cota · data-com {a.recordDate.split('-').reverse().join('/')} · pagamento {a.paymentDate.split('-').reverse().join('/')}</li>)}</ul>
          </div>
          <button type="button" className="btn" onClick={notify}>Ativar notificações do navegador</button>
          <button type="button" className="btn" onClick={() => { markDividendsSeen(assets, positions); setPositions([...positions]); }}>Marcar como visto</button>
        </div>
      )}
      <form onSubmit={add} className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-5" aria-label="Adicionar posição">
        <label className="flex flex-col gap-1 text-xs text-mist-400">Ticker<input className="input uppercase" list="pf-tickers" value={ticker} onChange={(e) => setTicker(e.target.value)} data-testid="pf-ticker" /></label>
        <datalist id="pf-tickers">{assets.filter((a) => a.cls === 'FII' || a.cls === 'FIAGRO' || a.cls === 'ACAO').slice(0, 1200).map((a) => <option key={a.ticker} value={a.ticker}>{a.name}</option>)}</datalist>
        <label className="flex flex-col gap-1 text-xs text-mist-400">Cotas que tenho<NumInput className="input num" decimals={false} value={shares} onChange={(e) => setShares(e.target.value)} data-testid="pf-shares" /></label>
        <div className="flex items-end"><button className="btn btn-gold w-full" type="submit" disabled={busy}><Plus size={14} aria-hidden />{busy ? 'Buscando…' : 'Adicionar'}</button></div>
        <label className="flex flex-col gap-1 text-xs text-mist-400 md:col-start-5">Cotas novas/mês desejadas<NumInput className="input num" decimals={false} value={desired} onChange={(e) => setDesired(e.target.value)} /></label>
        {err && <p className="col-span-full text-xs text-loss-400" role="alert">{err}</p>}
      </form>
      {positions.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="num w-full text-xs" data-testid="pf-table">
            <thead><tr className="bg-ink-800 text-mist-300">{['Ativo', 'Cotas', 'Preço', 'Valor', 'Renda/mês (último rend.)', `Número mágico (${k}/mês)`, 'Progresso', ''].map((h, i) => <th key={h + i} scope="col" className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
            <tbody>{positions.map((p) => {
              const a = assets.find((x) => x.ticker === p.ticker);
              const value = a ? a.close * p.shares : 0;
              const div = monthlyIncomePerShare(a);
              const income = Math.round(div * p.shares * 100) / 100;
              totalValue += value; totalIncome += income;
              const m = a && div > 0 ? magicNumber(String(a.close), String(div), k) : null;
              const progress = m?.finite ? Math.min(1, p.shares / m.shares) : null;
              return (
                <tr key={p.ticker} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{p.ticker}<span className="block text-[11px] font-normal text-mist-500">{a?.name ?? 'sem cotação recente'}</span></th>
                  <td className="px-3 py-2 text-right">{fmtInt(p.shares)}</td>
                  <td className="px-3 py-2 text-right">{a ? `R$ ${fmtDecimal(a.close, 2)}` : '—'}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(value.toFixed(2))}</td>
                  <td className="px-3 py-2 text-right">{div ? fmtBRL(income.toFixed(2)) : '—'}</td>
                  <td className="px-3 py-2 text-right">{m?.finite ? `${fmtInt(m.shares)} cotas` : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {progress === null ? '—' : (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Progresso de ${p.ticker}`}><span className="block h-full bg-gold-500" style={{ width: `${progress * 100}%` }} /></span>
                        {fmtPct(progress, 0)}{m && p.shares < m.shares ? ` · faltam ${fmtInt(m.shares - p.shares)}` : ' · atingido'}
                      </span>)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {a?.cnpj && <button type="button" className="btn !px-2 !py-1" onClick={() => go('simulador', { t: p.ticker })} aria-label={`Simular ${p.ticker}`}><Calculator size={12} aria-hidden /></button>}{' '}
                    <button type="button" className="btn !px-2 !py-1" onClick={() => setPositions((x) => x.filter((y) => y.ticker !== p.ticker))} aria-label={`Remover ${p.ticker}`}><Trash2 size={12} aria-hidden /></button>
                  </td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr className="border-t border-white/10 font-medium"><th scope="row" className="px-3 py-2 text-left">Total</th><td /><td /><td className="px-3 py-2 text-right">{fmtBRL(totalValue.toFixed(2))}</td><td className="px-3 py-2 text-right">{fmtBRL(totalIncome.toFixed(2))}</td><td colSpan={3} /></tr></tfoot>
          </table>
        </div>
      )}
      {positions.length > 0 && <FixedIncomeCheck {...portfolioTotals(positions, assets)} />}
      <IncomeCalendar positions={positions.filter((p) => assets.some((a) => a.ticker === p.ticker))} />
      <MonthlyContribution positions={positions} assets={assets} />
      <AlertChannels tickers={positions.map((p) => p.ticker)} />
      <p className="text-[11px] text-mist-500">Renda estimada: FIIs com o último rendimento (Fundos.NET); ações com a média mensal de dividendos + JCP brutos dos últimos 12 meses (B3 — Empresas Listadas). Proventos futuros podem ser diferentes. ETFs/BDRs aparecem só com valor.</p>
    </section>
  );
}
