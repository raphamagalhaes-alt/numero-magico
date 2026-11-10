import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Flame, PartyPopper, Settings2, ShieldCheck, TrendingUp } from 'lucide-react';
import { daysLabel, freedomDelayDays, planContribution } from '../../engine/freedom';
import { effectivePct, payDate, splitPayday, streak, type AutoRaise, type PayRule } from '../../engine/payday';
import { useUniverse } from '../data';
import { fmtBRL, fmtInt } from '../format';
import { loadRaw, save } from '../storage';
import { FREEDOM_KEY, loadFreedom, num, useFreedomPlan } from '../freedom-plan';
import { POS_KEY, TARGET_KEY, loadPositions, type Position } from './Portfolio';
import { CostInFreedom } from '../components/CostInFreedom';
import { go } from '../route';
import { AmountWords, NumInput } from '../components/NumInput';

export const PAYDAY_KEY = 'mxrf:payday';
interface Done { ym: string; date: string; save: number; toReserve: number; toInvest: number }
export interface PaydayState { configured: boolean; salary: string; rule: PayRule; pct: string; raise: AutoRaise; reserveMonths: string; reserveHave: string; reserveShare: number; history: Done[]; lastSalary: string }
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const DEFAULT: PaydayState = {
  configured: false, salary: '', rule: { kind: 'util', n: 5 }, pct: '10',
  raise: { on: true, step: 1, everyMonths: 6, max: 20, start: todayISO() },
  reserveMonths: '6', reserveHave: '0', reserveShare: 1, history: [], lastSalary: '',
};
export const loadPayday = (): PaydayState => ({ ...DEFAULT, ...loadRaw<Partial<PaydayState>>(PAYDAY_KEY, {}) });
const br = (iso: string) => iso.split('-').reverse().join('/');
const brl = (v: number) => fmtBRL(v.toFixed(2));
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });

/** Salário já caiu este mês e o plano ainda não foi feito? (usado no aviso do topo) */
export function paydayDue(s = loadPayday(), today = todayISO()): boolean {
  if (!s.configured) return false;
  const ym = today.slice(0, 7);
  return today >= payDate(ym, s.rule) && !s.history.some((h) => h.ym === ym);
}

export function MonthPage() {
  const u = useUniverse();
  const [s, setS] = useState<PaydayState>(loadPayday);
  const [editing, setEditing] = useState(() => !loadPayday().configured);
  const [toCarteira, setToCarteira] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => save(PAYDAY_KEY, s), [s]);
  const plan = useFreedomPlan();
  const today = todayISO();
  const ym = today.slice(0, 7);
  const salary = num(s.salary);
  const eff = effectivePct(num(s.pct), s.raise, today);
  const reserveTarget = Math.round(num(s.reserveMonths) * plan.cov.total * 100) / 100;
  const split = splitPayday({ salary, pct: eff.pct, reserveHave: num(s.reserveHave), reserveTarget, reserveShare: s.reserveShare });
  const thisPay = payDate(ym, s.rule);
  const nextYm = (() => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); })();
  const done = s.history.find((h) => h.ym === ym);
  const due = s.configured && today >= thisPay && !done;
  const nextPay = today >= thisPay ? payDate(nextYm, s.rule) : thisPay;
  const assets = useMemo(() => u.data?.assets ?? [], [u.data]);
  const positions = loadPositions();
  const targets = loadRaw<Record<string, string>>(TARGET_KEY, {});
  const holdings = positions.map((p) => ({ p, a: assets.find((x) => x.ticker === p.ticker) })).filter((r) => r.a && r.a.close > 0)
    .map(({ p, a }) => ({ ticker: p.ticker, shares: p.shares, price: a!.close, target: Math.max(0, num(targets[p.ticker] ?? '1')) }));
  const buys = planContribution(holdings, split.toInvest);
  const gain = split.toInvest > 0 ? freedomDelayDays({ capital: plan.capital, contribution: plan.contribution, target: plan.target, rate: plan.rate }, { oneOff: -split.toInvest }) : null;
  const st = streak(s.history.map((h) => h.ym), ym);
  const months = s.history.length;
  const since = s.history.length ? s.history.map((h) => h.ym).sort()[0] : null;
  const possible = since ? (() => { const [a, b] = since.split('-').map(Number), [c, d] = ym.split('-').map(Number); return (c - a) * 12 + (d - b) + (done ? 1 : 0); })() : 0;
  const raiseSuggest = s.lastSalary && salary > num(s.lastSalary) ? salary - num(s.lastSalary) : 0;

  const markDone = () => {
    const entry: Done = { ym, date: today, save: split.save, toReserve: split.toReserve, toInvest: split.toInvest };
    setS((x) => ({ ...x, history: [...x.history.filter((h) => h.ym !== ym), entry], reserveHave: String(Math.round((num(x.reserveHave) + split.toReserve) * 100) / 100) }));
    if (toCarteira && buys.buys.length) {
      const map = new Map<string, Position>(positions.map((p) => [p.ticker, { ...p }]));
      for (const b of buys.buys) map.get(b.ticker)!.shares += b.shares;
      save(POS_KEY, [...map.values()]);
    }
    setMsg('Plano do mês feito! Você pagou a si mesmo primeiro. 👏');
  };
  const syncFreedom = () => {
    const f = loadFreedom();
    save(FREEDOM_KEY, { ...f, contribution: String(split.toInvest).replace('.', ',') });
    setMsg(`Plano da Liberdade atualizado: ${brl(split.toInvest)} por mês.`);
  };

  return (
    <section aria-labelledby="mo-title" className="flex flex-col gap-4" data-testid="month">
      <div>
        <h1 id="mo-title" className="flex items-center gap-2 text-xl font-semibold"><CalendarCheck size={20} className="text-gold-400" aria-hidden />Meu mês</h1>
        <p className="text-sm text-mist-400">Pague-se primeiro: no dia do salário, o app já diz quanto guardar, quanto vai para a reserva e quais cotas comprar. A decisão fica pronta antes de o dinheiro chegar.</p>
      </div>

      {s.configured && !editing && (
        <>
          {due && <div className="card p-4 ring-gold-500/50" role="status" data-testid="mo-due"><p className="flex items-center gap-2 text-sm font-semibold text-gold-300"><PartyPopper size={16} aria-hidden />Seu salário caiu em {br(thisPay)}. Hora do plano do mês!</p></div>}
          {!due && !done && <p className="text-sm text-mist-300" data-testid="mo-next">Próximo salário: <b>{br(nextPay)}</b> ({weekday(nextPay)}). O plano abaixo já está pronto para esse dia.</p>}
          {done && <p className="card p-4 text-sm text-gain-400" data-testid="mo-done">✓ Plano de {ym.split('-').reverse().join('/')} feito em {br(done.date)}: {brl(done.save)} guardados. Próximo salário: {br(nextPay)}.</p>}

          <div className="card flex flex-col gap-3 p-5" data-testid="mo-plan">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Guardar este mês ({eff.pct.toLocaleString('pt-BR')}% do salário)</p><p className="num text-2xl font-semibold text-gold-300" data-testid="mo-save">{brl(split.save)}</p><p className="text-[11px] text-mist-500">Fica para viver: {brl(Math.max(0, salary - split.save))}</p></div>
              <div className="rounded-lg bg-ink-850 p-3">
                <p className="flex items-center gap-1 text-[11px] text-mist-500"><ShieldCheck size={12} aria-hidden />Reserva de emergência</p>
                <p className="num text-xl font-semibold" data-testid="mo-reserve">{split.reserveDone ? 'completa ✓' : brl(split.toReserve)}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700"><div className="h-full bg-gain-500" style={{ width: `${reserveTarget ? Math.min(100, (num(s.reserveHave) / reserveTarget) * 100) : 0}%` }} /></div>
                <p className="text-[11px] text-mist-500">{brl(num(s.reserveHave))} de {brl(reserveTarget)} ({s.reserveMonths} meses de contas) — guarde em renda fixa com liquidez diária</p>
              </div>
              <div className="rounded-lg bg-ink-850 p-3"><p className="flex items-center gap-1 text-[11px] text-mist-500"><TrendingUp size={12} aria-hidden />Investir</p><p className="num text-xl font-semibold" data-testid="mo-invest">{brl(split.toInvest)}</p>
                {gain !== null && gain < 0 && <p className="text-[11px] text-gain-400" data-testid="mo-gain">Adianta sua liberdade em {daysLabel(-gain)}</p>}</div>
            </div>
            {split.toInvest > 0 && (
              holdings.length ? (
                <div>
                  <p className="text-xs text-mist-400">Compras sugeridas pela <b>sua</b> divisão da Carteira:</p>
                  {buys.buys.length ? <ul className="mt-1 text-sm" data-testid="mo-buys">{buys.buys.map((b) => <li key={b.ticker} className="flex justify-between border-t border-white/5 py-1 first:border-t-0"><span>{fmtInt(b.shares)} cota{b.shares > 1 ? 's' : ''} de <b>{b.ticker}</b></span><span className="num text-mist-300">{brl(b.cost)}</span></li>)}</ul>
                    : <p className="text-xs text-mist-500">O valor ainda não compra uma cota inteira — junte com o próximo mês.</p>}
                  {buys.leftover > 0 && buys.buys.length > 0 && <p className="text-[11px] text-mist-500">Sobra {brl(buys.leftover)} para o próximo mês.</p>}
                </div>
              ) : <p className="text-xs text-mist-500">Adicione seus ativos na <button type="button" className="underline" onClick={() => go('carteira')}>Carteira</button> para ver exatamente quais cotas comprar.</p>
            )}
            {!done && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-gold" onClick={markDone} data-testid="mo-markdone">Fiz o plano deste mês</button>
                {buys.buys.length > 0 && <label className="flex items-center gap-2 text-xs text-mist-300"><input type="checkbox" checked={toCarteira} onChange={(e) => setToCarteira(e.target.checked)} />Somar as cotas compradas na minha Carteira</label>}
              </div>
            )}
            {plan.contribution !== split.toInvest && split.toInvest > 0 && <button type="button" className="self-start text-xs text-gold-300 underline" onClick={syncFreedom} data-testid="mo-sync">Usar {brl(split.toInvest)}/mês no plano da Liberdade (hoje: {brl(plan.contribution)})</button>}
            {eff.nextAt && <p className="text-[11px] text-mist-500">Poupe Mais Amanhã: seu percentual sobe para {(eff.pct + s.raise.step).toLocaleString('pt-BR')}% em {eff.nextAt.split('-').reverse().join('/')} (teto {s.raise.max}%).</p>}
            {msg && <p className="text-sm text-gain-400" role="status">{msg}</p>}
          </div>

          {raiseSuggest > 0 && (
            <div className="card flex flex-wrap items-center gap-3 p-4 ring-gold-500/30" data-testid="mo-raise">
              <p className="flex-1 text-sm text-mist-200">Seu salário subiu {brl(raiseSuggest)}. Que tal guardar <b>metade do aumento</b>? Você continua vivendo melhor e acelera a liberdade.</p>
              <button type="button" className="btn btn-gold" onClick={() => setS((x) => ({ ...x, pct: String(Math.round(((split.save + raiseSuggest / 2) / salary) * 1000) / 10).replace('.', ','), lastSalary: x.salary }))}>Sim, guardar metade</button>
              <button type="button" className="btn" onClick={() => setS((x) => ({ ...x, lastSalary: x.salary }))}>Agora não</button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card flex flex-col gap-2 p-4" data-testid="mo-streak">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Flame size={16} className="text-gold-400" aria-hidden />Sequência</h2>
              <p className="num text-3xl font-semibold text-gold-300">{st} {st === 1 ? 'mês seguido' : 'meses seguidos'}</p>
              <p className="text-xs text-mist-400">{months ? `Você cumpriu o plano em ${months} de ${Math.max(months, possible)} meses desde ${since!.split('-').reverse().join('/')}.` : (due ? 'Faça o plano deste mês para começar sua sequência.' : 'Seu primeiro mês começa no próximo salário.')} Investir todo mês, mesmo pouco, é o hábito que mais muda o resultado.</p>
              {s.history.length > 0 && <ul className="text-xs text-mist-300">{[...s.history].sort((a, b) => b.ym.localeCompare(a.ym)).slice(0, 6).map((h) => <li key={h.ym} className="flex justify-between border-t border-white/5 py-1 first:border-t-0"><span>{h.ym.split('-').reverse().join('/')}</span><span className="num">{brl(h.save)}</span></li>)}</ul>}
            </div>
            <CostInFreedom compact />
          </div>
          <button type="button" className="btn self-start" onClick={() => setEditing(true)}><Settings2 size={14} aria-hidden />Ajustar salário e regras</button>
        </>
      )}

      {editing && (
        <form className="card flex flex-col gap-3 p-5" data-testid="mo-setup" onSubmit={(e) => { e.preventDefault(); if (!(num(s.salary) > 0)) return setMsg('Informe o salário líquido.'); setS((x) => ({ ...x, configured: true, lastSalary: x.lastSalary || x.salary })); setEditing(false); setMsg(null); }}>
          <h2 className="text-base font-semibold">Seu salário e suas regras</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-mist-400">Salário líquido (R$)<NumInput className="input num" inputMode="decimal" value={s.salary} onChange={(e) => setS({ ...s, salary: e.target.value })} data-testid="mo-salary" /><AmountWords value={s.salary} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Quando cai
              <select className="input" value={s.rule.kind === 'util' ? `u${s.rule.n}` : `d${s.rule.day}`} onChange={(e) => { const v = e.target.value; setS({ ...s, rule: v[0] === 'u' ? { kind: 'util', n: Number(v.slice(1)) } : { kind: 'dia', day: Number(v.slice(1)) } }); }} data-testid="mo-rule">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={`u${n}`} value={`u${n}`}>{n}º dia útil</option>)}
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={`d${d}`} value={`d${d}`}>Todo dia {d}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Guardar (% do salário)<NumInput className="input num" inputMode="decimal" value={s.pct} onChange={(e) => setS({ ...s, pct: e.target.value })} data-testid="mo-pct" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Reserva de emergência (meses de contas)<NumInput className="input num" inputMode="numeric" value={s.reserveMonths} onChange={(e) => setS({ ...s, reserveMonths: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Já tenho de reserva (R$)<NumInput className="input num" inputMode="decimal" value={s.reserveHave} onChange={(e) => setS({ ...s, reserveHave: e.target.value })} data-testid="mo-reserve-have" /><AmountWords value={s.reserveHave} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Enquanto a reserva não completa
              <select className="input" value={String(s.reserveShare)} onChange={(e) => setS({ ...s, reserveShare: Number(e.target.value) })}><option value="1">Tudo para a reserva</option><option value="0.5">Metade reserva, metade investe</option><option value="0">Investir tudo (já tenho reserva)</option></select>
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-mist-200"><input type="checkbox" className="mt-1" checked={s.raise.on} onChange={(e) => setS({ ...s, raise: { ...s.raise, on: e.target.checked, start: s.raise.start || todayISO() } })} />
            <span>Poupe Mais Amanhã: subir {s.raise.step} ponto a cada {s.raise.everyMonths} meses, até {s.raise.max}% <span className="block text-[11px] text-mist-500">Método de Richard Thaler (Nobel de Economia): aumentos pequenos e automáticos, que quase não se sentem no bolso.</span></span>
          </label>
          <p className="text-[11px] text-mist-500">O valor da reserva usa o total das suas contas da casa na página Liberdade ({brl(plan.cov.total)}/mês). Tudo fica só neste aparelho.</p>
          {msg && <p className="text-xs text-loss-400" role="alert">{msg}</p>}
          <button type="submit" className="btn btn-gold self-start" data-testid="mo-save-setup">Salvar e ver meu plano</button>
        </form>
      )}
    </section>
  );
}
