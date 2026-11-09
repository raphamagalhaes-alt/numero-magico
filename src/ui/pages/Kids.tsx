import { useEffect, useState } from 'react';
import { Baby, Pencil, Plus, Sprout, Trash2 } from 'lucide-react';
import { kidPlan, type KidGoal } from '../../engine/kids';
import { fmtBRL, fmtPct } from '../format';
import { loadRaw, save } from '../storage';
import { num, useFreedomPlan } from '../freedom-plan';

const KEY = 'mxrf:kids';
const GOALS = ['Faculdade', 'Primeiro carro', 'Intercâmbio', 'Entrada da casa própria', 'Começo da vida adulta'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const brl = (v: number) => fmtBRL(v.toFixed(2));
const when = (months: number | null) => { if (months === null) return null; const d = new Date(); d.setMonth(d.getMonth() + months); return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''); };
const stage = (pct: number) => (pct >= 1 ? '🌳' : pct >= 0.66 ? '🌿' : pct >= 0.33 ? '🪴' : '🌱');

type Form = { name: string; birth: string; goal: string; target: string; atAge: string; monthly: string; have: string };
const EMPTY: Form = { name: '', birth: '', goal: GOALS[0], target: '100.000', atAge: '18', monthly: '100', have: '0' };

export function KidsPage() {
  const plan = useFreedomPlan();
  const [kids, setKids] = useState<KidGoal[]>(() => { const v = loadRaw<unknown>(KEY, []); return Array.isArray(v) ? (v as KidGoal[]) : []; });
  useEffect(() => save(KEY, kids), [kids]);
  const [form, setForm] = useState<Form | null>(() => (loadRaw<unknown[]>(KEY, []).length ? null : EMPTY));
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kidView, setKidView] = useState<number | null>(null);
  const t = today();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const k: KidGoal = { name: form.name.trim().slice(0, 30), birth: form.birth, goal: form.goal, target: num(form.target), atAge: Math.round(num(form.atAge)), monthly: num(form.monthly), have: num(form.have) };
    if (!k.name) return setErr('Informe o nome ou apelido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k.birth) || k.birth > t) return setErr('Informe a data de nascimento.');
    if (!(k.target > 0) || !(k.atAge > 0) || k.atAge > 40) return setErr('Informe a meta e a idade (até 40 anos).');
    if (kidPlan(k, t, plan.rate).monthsLeft <= 0) return setErr('A idade da meta precisa ser maior que a idade atual.');
    setErr(null);
    setKids((l) => (editIdx === null ? [...l, k] : l.map((x, i) => (i === editIdx ? k : x))));
    setForm(null); setEditIdx(null);
  };

  return (
    <section aria-labelledby="kd-title" className="flex flex-col gap-4" data-testid="kids">
      <div>
        <h1 id="kd-title" className="flex items-center gap-2 text-xl font-semibold"><Baby size={20} className="text-gold-400" aria-hidden />Primeiro investimento dos filhos</h1>
        <p className="text-sm text-mist-400">Transforme a mesada em cotas e mostre para a criança a árvore crescendo. Valores em reais de hoje, rendendo {fmtPct(plan.rate, 1)} ao ano acima da inflação (a mesma taxa do seu plano).</p>
      </div>

      {kids.map((k, i) => {
        const p = kidPlan(k, t, plan.rate);
        return (
          <article key={i} className="card flex flex-col gap-3 p-5" data-testid="kid-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{stage(p.pct)} {k.name} <span className="text-sm font-normal text-mist-400">· {p.ageNow} anos · {k.goal}</span></h2>
                <p className="text-xs text-mist-500">Meta: {brl(k.target)} aos {k.atAge} anos · guardando {brl(k.monthly)}/mês · já tem {brl(k.have)}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn !px-2 !py-1 text-xs" onClick={() => setKidView(kidView === i ? null : i)} data-testid="kid-show">{kidView === i ? 'Voltar' : 'Mostrar para a criança'}</button>
                <button type="button" className="btn !px-1.5 !py-1" aria-label={`Editar ${k.name}`} onClick={() => { setEditIdx(i); setForm({ name: k.name, birth: k.birth, goal: k.goal, target: String(k.target), atAge: String(k.atAge), monthly: String(k.monthly).replace('.', ','), have: String(k.have).replace('.', ',') }); }}><Pencil size={12} aria-hidden /></button>
                <button type="button" className="btn !px-1.5 !py-1" aria-label={`Remover ${k.name}`} onClick={() => window.confirm(`Remover a meta de ${k.name}?`) && setKids((l) => l.filter((_, x) => x !== i))}><Trash2 size={12} aria-hidden /></button>
              </div>
            </div>
            {kidView === i ? (
              <div className="rounded-xl bg-gradient-to-br from-ink-800 to-ink-900 p-6 text-center" data-testid="kid-view">
                <p className="text-7xl" aria-hidden>{stage(p.pct)}</p>
                <p className="mt-3 text-xl font-semibold text-gold-300">{k.name}, sua árvore do dinheiro já tem {brl(k.have)}!</p>
                <p className="mt-2 text-base text-mist-200">Cada {brl(k.monthly)} guardado é uma sementinha. Ela cresce sozinha com o tempo e, quando você tiver {k.atAge} anos, pode virar <b className="text-gold-300">{brl(p.projected)}</b> para {k.goal.toLowerCase()}.</p>
                <div className="mx-auto mt-4 h-4 max-w-md overflow-hidden rounded-full bg-ink-700"><div className="h-full bg-gain-500" style={{ width: `${p.pct * 100}%` }} /></div>
                <p className="mt-2 text-sm text-mist-400">{fmtPct(p.pct, 0)} do caminho até a meta</p>
                {p.birthdays.length > 0 && <p className="mt-3 text-sm text-mist-300">No seu próximo aniversário ({p.birthdays[0].age} anos): {brl(p.birthdays[0].value)} 🎂</p>}
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Aos {k.atAge} anos terá</p><p className="num text-xl font-semibold text-gold-300" data-testid="kid-projected">{brl(p.projected)}</p><p className="text-[11px] text-mist-500">{fmtPct(p.pct, 0)} da meta</p></div>
                  <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Chega na meta</p><p className="text-xl font-semibold" data-testid="kid-reach">{p.reachAge === null ? 'mais de 100 anos' : `aos ${p.reachAge} anos`}</p><p className="text-[11px] text-mist-500">{when(p.reachMonths) ?? ''}</p></div>
                  <div className="rounded-lg bg-ink-850 p-3"><p className="text-[11px] text-mist-500">Para chegar aos {k.atAge}, guardar</p><p className="num text-xl font-semibold" data-testid="kid-needed">{brl(p.needed)}/mês</p><p className={`text-[11px] ${p.onTrack ? 'text-gain-400' : 'text-gold-300'}`}>{p.onTrack ? 'No caminho certo ✓' : `faltam ${brl(Math.max(0, p.needed - k.monthly))}/mês`}</p></div>
                </div>
                {p.birthdays.length > 0 && (
                  <details className="text-xs text-mist-400"><summary className="cursor-pointer">Quanto terá em cada aniversário</summary>
                    <ul className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">{p.birthdays.map((b) => <li key={b.age} className="rounded bg-ink-850 p-1.5 text-center"><span className="block text-mist-500">{b.age} anos</span><span className="num text-mist-200">{brl(b.value)}</span></li>)}</ul>
                  </details>
                )}
              </>
            )}
          </article>
        );
      })}

      {form ? (
        <form onSubmit={submit} className="card flex flex-col gap-3 p-5" data-testid="kid-form">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Sprout size={16} className="text-gold-400" aria-hidden />{editIdx === null ? 'Nova meta' : 'Editar meta'}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-mist-400">Nome ou apelido<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} data-testid="kid-name" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Nascimento<input className="input" type="date" value={form.birth} max={t} onChange={(e) => setForm({ ...form, birth: e.target.value })} data-testid="kid-birth" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Para quê
              <select className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>{GOALS.map((g) => <option key={g}>{g}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Valor da meta (R$ de hoje)<input className="input num" inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} data-testid="kid-target" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Com quantos anos<input className="input num" inputMode="numeric" value={form.atAge} onChange={(e) => setForm({ ...form, atAge: e.target.value })} data-testid="kid-age" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Guardar por mês (R$)<input className="input num" inputMode="decimal" value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} data-testid="kid-monthly" /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Já guardado (R$)<input className="input num" inputMode="decimal" value={form.have} onChange={(e) => setForm({ ...form, have: e.target.value })} data-testid="kid-have" /></label>
          </div>
          {err && <p className="text-xs text-loss-400" role="alert">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-gold" data-testid="kid-save">Salvar meta</button>
            {kids.length > 0 && <button type="button" className="btn" onClick={() => { setForm(null); setEditIdx(null); setErr(null); }}>Cancelar</button>}
          </div>
        </form>
      ) : (
        <button type="button" className="btn self-start" onClick={() => setForm(EMPTY)} data-testid="kid-add"><Plus size={14} aria-hidden />Adicionar filho(a) ou meta</button>
      )}
      <p className="text-[11px] text-mist-500">Dica: investimentos em nome de menores têm regras próprias na corretora (conta com responsável legal). Os dados ficam só neste aparelho. Projeção educativa, não é promessa de rendimento nem recomendação.</p>
    </section>
  );
}
