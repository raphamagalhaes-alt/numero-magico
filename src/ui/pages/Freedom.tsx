import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Plus, Sunrise, Trash2 } from 'lucide-react';
import { billTimeline, capitalForIncome, contributionFor, monthsToTarget, type Bill } from '../../engine/freedom';
import { fmtBRL, fmtPct } from '../format';
import { go } from '../route';
import { loadRaw, save } from '../storage';
import { FREEDOM_DEFAULT, FREEDOM_KEY, num, useFreedomPlan, type FreedomState } from '../freedom-plan';
import { FamilyGoals } from '../components/FamilyGoals';
import { CostInFreedom } from '../components/CostInFreedom';
import { AmountWords, NumInput } from '../components/NumInput';

const KEY = FREEDOM_KEY;
type State = FreedomState;
const DEFAULT = FREEDOM_DEFAULT;
const brl = (v: number) => fmtBRL(v.toFixed(2));
const when = (months: number | null) => {
  if (months === null) return 'mais de 100 anos';
  if (months === 0) return 'já paga';
  const d = new Date(); d.setMonth(d.getMonth() + months);
  const y = Math.floor(months / 12), m = months % 12;
  const mm = (n: number) => `${n} ${n > 1 ? 'meses' : 'mês'}`;
  const span = y ? `${y} ano${y > 1 ? 's' : ''}${m ? ` e ${mm(m)}` : ''}` : mm(m);
  return `${d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')} (em ${span})`;
};

/** Valor de uma conta: texto próprio durante a edição (permite centavos, como 89,90). */
function BillAmount({ amount, name, onChange }: { amount: number; name: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(() => String(amount).replace('.', ','));
  useEffect(() => { if (num(text) !== amount) setText(String(amount).replace('.', ',')); }, [amount]); // eslint-disable-line react-hooks/exhaustive-deps
  return <NumInput className="input num w-24 !py-1.5 text-right" aria-label={`Valor de ${name}`} value={text} onChange={(e) => { setText(e.target.value); onChange(num(e.target.value)); }} />;
}

export function FreedomPage() {
  const [s, setS] = useState<State>(() => ({ ...DEFAULT, ...loadRaw<Partial<State>>(KEY, {}) }));
  useEffect(() => save(KEY, s), [s]);
  const set = (k: keyof State) => (e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, [k]: e.target.value }));

  const plan = useFreedomPlan(s);
  const { ipca: ipcaPlus, rate, pf, otherCapitalIncome, income, capital, contribution, cov } = plan;
  const timeline = billTimeline(s.bills, income, 0, contribution, rate);
  const fullCapital = plan.missingCapital;
  const fullMonths = fullCapital === null ? null : monthsToTarget(0, contribution, fullCapital, rate);
  const years = Math.max(1, Math.min(60, Math.round(num(s.years)) || 15));
  const needed = fullCapital === null ? null : contributionFor(0, fullCapital, years * 12, rate);
  const nextCapital = cov.next ? capitalForIncome(cov.next.missing, rate) : null;

  const moveBill = (i: number, d: -1 | 1) => setS((x) => { const b = [...x.bills]; const j = i + d; if (j < 0 || j >= b.length) return x; [b[i], b[j]] = [b[j], b[i]]; return { ...x, bills: b }; });
  const editBill = (i: number, patch: Partial<Bill>) => setS((x) => ({ ...x, bills: x.bills.map((b, k) => (k === i ? { ...b, ...patch } : b)) }));

  return (
    <section aria-labelledby="fr-title" className="flex flex-col gap-4" data-testid="freedom">
      <div>
        <h1 id="fr-title" className="flex items-center gap-2 text-xl font-semibold"><Sunrise size={20} className="text-gold-400" aria-hidden />Liberdade financeira</h1>
        <p className="text-sm text-mist-400">Quanto das contas da sua casa seus investimentos já pagam — e quando vão pagar todas. Valores em reais de hoje (já descontada a inflação).</p>
      </div>

      <div className="card flex flex-col gap-3 p-5 ring-gold-500/30" data-testid="fr-index">
        <p className="text-xs uppercase tracking-wide text-mist-400">Seu índice de liberdade</p>
        <p className="num text-4xl font-semibold text-gold-300">{fmtPct(cov.pct, 0)}</p>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cov.pct * 100)} aria-label="Índice de liberdade"><div className="h-full bg-gradient-to-r from-gold-600 to-gold-400" style={{ width: `${cov.pct * 100}%` }} /></div>
        <p className="text-sm text-mist-200">Renda passiva de <b>{brl(income)}/mês</b> para contas de <b>{brl(cov.total)}/mês</b>.</p>
        {cov.covered.length > 0 && <p className="text-sm text-gain-400" data-testid="fr-covered">Seus investimentos já pagam: <b>{cov.covered.map((b) => b.name).join(', ')}</b>.</p>}
        {cov.next && (
          <p className="text-sm text-mist-300" data-testid="fr-next">Próxima conquista: <b className="text-mist-100">{cov.next.bill.name}</b> — faltam {brl(cov.next.missing)} por mês de renda{nextCapital !== null ? <>, o que equivale a cerca de <b>{brl(nextCapital)}</b> a mais investidos.</> : '.'}</p>
        )}
        {!cov.next && cov.total > 0 && <p className="text-sm font-semibold text-gain-400">Todas as contas cobertas! Sobra {brl(cov.surplus)} por mês.</p>}
        {income === 0 && <p className="text-xs text-mist-500">Ainda sem renda passiva: adicione seus ativos em <button type="button" className="underline" onClick={() => go('carteira')}>Carteira</button> ou informe outras rendas abaixo.</p>}
      </div>

      <CostInFreedom />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-2 p-4" data-testid="fr-bills">
          <h2 className="text-base font-semibold">Contas da casa (por mês)</h2>
          <p className="text-xs text-mist-500">A ordem importa: a renda paga primeiro as de cima. Coloque as menores primeiro para conquistar mais rápido.</p>
          <ul className="flex flex-col gap-1.5">
            {s.bills.map((b, i) => {
              const ok = cov.covered.includes(b);
              return (
                <li key={i} className="flex items-center gap-2">
                  {ok ? <CheckCircle2 size={16} className="shrink-0 text-gain-400" aria-label="paga" /> : <Circle size={16} className="shrink-0 text-mist-600" aria-label="ainda não" />}
                  <input className="input min-w-0 flex-1 !py-1.5" value={b.name} aria-label="Nome da conta" onChange={(e) => editBill(i, { name: e.target.value })} />
                  <BillAmount amount={b.amount} name={b.name} onChange={(v) => editBill(i, { amount: Math.max(0, v) })} />
                  <button type="button" className="btn !px-1.5 !py-1" onClick={() => moveBill(i, -1)} aria-label={`Subir ${b.name}`}><ArrowUp size={12} aria-hidden /></button>
                  <button type="button" className="btn !px-1.5 !py-1" onClick={() => moveBill(i, 1)} aria-label={`Descer ${b.name}`}><ArrowDown size={12} aria-hidden /></button>
                  <button type="button" className="btn !px-1.5 !py-1" onClick={() => setS((x) => ({ ...x, bills: x.bills.filter((_, k) => k !== i) }))} aria-label={`Remover ${b.name}`}><Trash2 size={12} aria-hidden /></button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setS((x) => ({ ...x, bills: [...x.bills, { name: 'Nova conta', amount: 100 }] }))}><Plus size={14} aria-hidden />Adicionar conta</button>
            <button type="button" className="btn" onClick={() => setS((x) => ({ ...x, bills: [...x.bills].sort((a, b) => a.amount - b.amount) }))}>Menores primeiro</button>
          </div>
        </div>

        <div className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-semibold">Seus números</h2>
          <p className="text-xs text-mist-400">Da sua Carteira: patrimônio <b>{brl(pf.value)}</b> · renda estimada <b>{brl(pf.income)}/mês</b>.{otherCapitalIncome > 0 ? <> Outros investimentos rendendo {fmtPct(rate, 1)}: <b>{brl(otherCapitalIncome)}/mês</b>.</> : null}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-mist-400">Outras rendas passivas/mês (R$)<NumInput className="input num" inputMode="decimal" value={s.extraIncome} onChange={set('extraIncome')} data-testid="fr-extra-income" /><AmountWords value={s.extraIncome} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Outros investimentos (R$)<NumInput className="input num" inputMode="decimal" value={s.extraCapital} onChange={set('extraCapital')} data-testid="fr-extra-capital" /><AmountWords value={s.extraCapital} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Quanto invisto por mês (R$)<NumInput className="input num" inputMode="decimal" value={s.contribution} onChange={set('contribution')} data-testid="fr-contribution" /><AmountWords value={s.contribution} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Rentabilidade acima da inflação (% ao ano)<NumInput className="input num" inputMode="decimal" placeholder={ipcaPlus ? String((ipcaPlus.rate * 100).toFixed(2)).replace('.', ',') : '6'} value={s.rate} onChange={set('rate')} data-testid="fr-rate" /></label>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {ipcaPlus && <button type="button" className="rounded-full px-2.5 py-1 ring-1 ring-gold-500/40 text-gold-300" onClick={() => setS((x) => ({ ...x, rate: '' }))}>Tesouro IPCA+ hoje: {fmtPct(ipcaPlus.rate, 2)}</button>}
            {[4, 6, 8].map((r) => <button key={r} type="button" className="rounded-full px-2.5 py-1 text-mist-300 ring-1 ring-white/10" onClick={() => setS((x) => ({ ...x, rate: String(r) }))}>{r === 4 ? 'Conservadora' : r === 6 ? 'Moderada' : 'Otimista'} {r}%</button>)}
          </div>
          <p className="text-[11px] text-mist-500">Usamos {fmtPct(rate, 2)} ao ano acima da inflação{!s.rate && ipcaPlus ? ` (${ipcaPlus.label}, título público, como referência de mercado)` : ''}. Quanto maior a taxa, maior o risco de não se realizar.</p>
        </div>
      </div>

      <div className="card p-4" data-testid="fr-plan">
        <h2 className="text-base font-semibold">Seu plano</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Para pagar todas as contas, faltam</p><p className="num text-lg font-semibold">{fullCapital === null ? '—' : brl(fullCapital)}</p><p className="text-[11px] text-mist-500">investidos além dos {brl(capital)} que você já tem</p></div>
          <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Investindo {brl(contribution)}/mês, você chega</p><p className="text-lg font-semibold text-gold-300" data-testid="fr-when">{when(fullMonths)}</p></div>
          <div className="rounded-lg bg-ink-850 p-3">
            <p className="flex items-center gap-1 text-[11px] text-mist-500">Para chegar em <NumInput className="input num w-12 !px-1 !py-0 text-center" inputMode="numeric" value={s.years} onChange={set('years')} aria-label="Anos" data-testid="fr-years" /> anos</p>
            <p className="num text-lg font-semibold">{needed === null ? '—' : `${brl(needed)}/mês`}</p><p className="text-[11px] text-mist-500">de aporte</p>
          </div>
        </div>
        <h3 className="mt-4 text-sm font-semibold">Linha do tempo: quando cada conta passa a ser paga pelos seus investimentos</h3>
        <ol className="mt-2 flex flex-col gap-1" data-testid="fr-timeline">
          {timeline.map(({ bill, months }, i) => (
            <li key={i} className="flex items-center justify-between gap-2 border-t border-white/5 py-1.5 text-sm first:border-t-0">
              <span className="flex items-center gap-2">{cov.covered.includes(bill) ? <CheckCircle2 size={15} className="text-gain-400" aria-hidden /> : <Circle size={15} className="text-mist-600" aria-hidden />}{bill.name} <span className="text-xs text-mist-500">{brl(bill.amount)}</span></span>
              <span className={`text-xs ${cov.covered.includes(bill) ? 'text-gain-400' : 'text-mist-300'}`}>{cov.covered.includes(bill) ? 'já paga' : when(months)}</span>
            </li>
          ))}
        </ol>
      </div>

      <FamilyGoals me={{ pct: cov.pct, covered: cov.covered.map((b) => b.name), next: cov.next?.bill.name ?? null, income, total: cov.total }} />

      <details className="text-xs text-mist-500">
        <summary className="cursor-pointer">Como calculamos</summary>
        <p className="mt-2">Renda passiva = renda estimada da Carteira (FIIs pelo último rendimento; ações pela média de 12 meses) + outras rendas que você informar. Outros investimentos contam como capital rendendo a taxa escolhida. O capital que falta é o que, rendendo essa taxa acima da inflação, gera a renda que ainda falta para as contas sem diminuir o poder de compra do patrimônio (renda = capital × taxa ÷ 12). Aportes no fim de cada mês, juros compostos mensais, sem impostos e custos. Projeção educativa, não é promessa de resultado nem recomendação.</p>
      </details>
    </section>
  );
}
