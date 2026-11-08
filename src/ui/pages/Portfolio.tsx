import { useEffect, useMemo, useState } from 'react';
import { Bell, Calculator, PiggyBank, Plus, Trash2, Wallet } from 'lucide-react';
import { magicNumber } from '../../engine';
import { planContribution } from '../../engine/freedom';
import type { AssetMetrics } from '../../market/universe';
import { useUniverse } from '../data';
import { fmtBRL, fmtDecimal, fmtInt, fmtPct } from '../format';
import { go } from '../route';
import { loadRaw, save } from '../storage';
import { AlertChannels } from '../components/AlertChannels';
import { FixedIncomeCheck, IncomeCalendar } from '../components/IncomeInsights';

export interface Position { ticker: string; shares: number }
const POS_KEY = 'mxrf:positions';
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

const TARGET_KEY = 'mxrf:targets';

/** Aporte do mês: quantas cotas inteiras comprar de cada ativo para chegar perto da divisão que a pessoa escolheu. */
function MonthlyContribution({ positions, assets }: { positions: Position[]; assets: AssetMetrics[] }) {
  const [cash, setCash] = useState('500');
  const [targets, setTargets] = useState<Record<string, string>>(() => loadRaw<Record<string, string>>(TARGET_KEY, {}));
  useEffect(() => save(TARGET_KEY, targets), [targets]);
  const rows = positions.map((p) => ({ p, a: assets.find((x) => x.ticker === p.ticker) })).filter((r) => r.a && r.a.close > 0);
  const num = (s: string | undefined) => { const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const holdings = rows.map(({ p, a }) => ({ ticker: p.ticker, shares: p.shares, price: a!.close, target: num(targets[p.ticker] ?? '1') }));
  const money = num(cash);
  const plan = planContribution(holdings, money);
  const tsum = holdings.reduce((s, h) => s + h.target, 0);
  if (!rows.length) return null;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="ap-title" data-testid="pf-contrib">
      <div>
        <h2 id="ap-title" className="flex items-center gap-2 text-base font-semibold"><PiggyBank size={16} className="text-gold-400" aria-hidden />Aporte do mês</h2>
        <p className="text-xs text-mist-400">Diga quanto vai investir e a divisão que <b>você</b> quer (pesos). Calculamos quantas cotas inteiras comprar de cada um para chegar mais perto dessa divisão, sem vender nada.</p>
      </div>
      <label className="flex max-w-xs flex-col gap-1 text-xs text-mist-400">Quanto vou investir agora (R$)<input className="input num" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} data-testid="ap-cash" /></label>
      <div className="overflow-x-auto">
        <table className="num w-full text-xs">
          <thead><tr className="text-mist-400">{['Ativo', 'Peso que eu quero', 'Hoje', 'Alvo', 'Comprar', 'Custo', 'Depois'].map((h, i) => <th key={h} scope="col" className={`px-2 py-1.5 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>{holdings.map((h) => {
            const buy = plan.buys.find((b) => b.ticker === h.ticker);
            const aft = plan.after.find((x) => x.ticker === h.ticker)!;
            const totalNow = holdings.reduce((s, x) => s + x.shares * x.price, 0);
            return (
              <tr key={h.ticker} className="border-t border-white/5" data-ticker={h.ticker}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium">{h.ticker}</th>
                <td className="px-2 py-1.5 text-right"><input className="input num w-16 !py-1 text-right" inputMode="decimal" aria-label={`Peso de ${h.ticker}`} value={targets[h.ticker] ?? '1'} onChange={(e) => setTargets((t) => ({ ...t, [h.ticker]: e.target.value }))} /></td>
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
      <p className="text-xs text-mist-300" data-testid="ap-summary">{plan.buys.length ? <>Total a comprar: <b>{fmtBRL(plan.spent.toFixed(2))}</b> · sobra {fmtBRL(plan.leftover.toFixed(2))} (fica para o próximo mês).</> : 'Com esse valor não dá para comprar uma cota inteira que aproxime da divisão escolhida.'}</p>
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

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    const n = Number(shares);
    if (!assets.some((a) => a.ticker === t)) return setErr('Ticker não encontrado entre os ativos negociados.');
    if (!Number.isInteger(n) || n < 0) return setErr('Informe um número inteiro de cotas.');
    setErr(null);
    setPositions((p) => [...p.filter((x) => x.ticker !== t), { ticker: t, shares: n }].sort((a, b) => a.ticker.localeCompare(b.ticker)));
    setTicker(''); setShares('');
  };
  const notify = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted' && alerts.length) new Notification('Novos rendimentos anunciados', { body: alerts.map((a) => `${a.ticker}: R$ ${fmtDecimal(a.amount, 3)}`).join(' · ') });
  };
  const k = Math.max(1, Math.floor(Number(desired)) || 1);
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
        <label className="flex flex-col gap-1 text-xs text-mist-400">Cotas que tenho<input className="input num" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} data-testid="pf-shares" /></label>
        <div className="flex items-end"><button className="btn btn-gold w-full" type="submit"><Plus size={14} aria-hidden />Adicionar</button></div>
        <label className="flex flex-col gap-1 text-xs text-mist-400 md:col-start-5">Cotas novas/mês desejadas<input className="input num" inputMode="numeric" value={desired} onChange={(e) => setDesired(e.target.value)} /></label>
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
