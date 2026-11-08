import { useEffect, useMemo, useState } from 'react';
import { Bell, Calculator, Plus, Trash2, Wallet } from 'lucide-react';
import { magicNumber } from '../../engine';
import type { AssetMetrics } from '../../market/universe';
import { useUniverse } from '../data';
import { fmtBRL, fmtDecimal, fmtInt, fmtPct } from '../format';
import { go } from '../route';
import { loadRaw, save } from '../storage';

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
        <p className="text-sm text-mist-400">Informe quantas cotas você já tem. Mostramos o quanto falta para o número mágico de cada fundo com o último rendimento oficial, e avisamos quando sair um novo aviso de rendimento. Os dados ficam apenas neste navegador.</p>
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
        <datalist id="pf-tickers">{assets.filter((a) => a.cls === 'FII' || a.cls === 'FIAGRO').slice(0, 800).map((a) => <option key={a.ticker} value={a.ticker}>{a.name}</option>)}</datalist>
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
              const div = a?.lastDividend?.amount ?? 0;
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
      <p className="text-[11px] text-mist-500">Renda estimada com o último rendimento oficial (Fundos.NET) e preço do último fechamento (B3); rendimentos futuros podem ser diferentes. Ações/ETFs/BDRs aparecem com valor, sem renda estimada.</p>
    </section>
  );
}
