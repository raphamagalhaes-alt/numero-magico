import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { useUniverse } from '../data';
import { fmtBRL, fmtPct } from '../format';
import { loadRaw, save } from '../storage';
import { loadCache } from '../../markets/quotes';
import { currentStorm } from '../storm-state';
import { NumInput } from '../components/NumInput';

const KEY = 'mxrf:journal';
type Action = 'Comprar' | 'Vender' | 'Manter' | 'Esperar';
interface Review { date: string; verdict: 'vale' | 'mudou'; note: string; price: number | null }
export interface Entry { id: string; date: string; ticker: string; action: Action; price: number | null; reason: string; answers: boolean[]; revisit: string; coolUntil: string | null; reviews: Review[] }

/** Perguntas feitas antes de cada decisão; as duas últimas acendem o alerta de impulso. */
export const QUESTIONS = [
  'Eu entendo como esse negócio/fundo ganha dinheiro.',
  'Isso faz parte do meu plano (divisão da carteira, metas).',
  'Posso deixar esse dinheiro investido por anos, se precisar.',
  'Já tenho reserva de emergência guardada.',
  'NÃO estou agindo por medo, euforia ou dica de alguém.',
];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const plusMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('en-CA'); };
const br = (iso: string) => iso.split('-').reverse().join('/');
const brl = (v: number) => fmtBRL(v.toFixed(2));

export function loadJournal(): Entry[] { const v = loadRaw<unknown>(KEY, []); return Array.isArray(v) ? (v as Entry[]).filter((e) => e && typeof e.id === 'string') : []; }
/** Decisões cuja data de revisão chegou e ainda não foram revisadas. */
export const dueReviews = (list: Entry[]) => list.filter((e) => e.revisit <= today() && !e.reviews.length);

export function JournalPage() {
  const u = useUniverse();
  const [list, setList] = useState<Entry[]>(loadJournal);
  useEffect(() => save(KEY, list), [list]);
  const [f, setF] = useState({ ticker: '', action: 'Comprar' as Action, price: '', reason: '', revisit: '6' });
  const [answers, setAnswers] = useState<boolean[]>(QUESTIONS.map(() => false));
  const [err, setErr] = useState<string | null>(null);
  const priceNow = useMemo(() => {
    const mk = loadCache().q;
    return (t: string): number | null => u.data?.assets.find((a) => a.ticker === t)?.close ?? mk[t]?.price ?? null;
  }, [u.data]);
  const impulse = !answers[3] || !answers[4];

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = f.ticker.trim().toUpperCase();
    if (!/^[A-Z0-9^.]{4,8}$/.test(t)) return setErr('Informe o código do ativo (ex.: PETR4, MXRF11, AAPL34).');
    if (f.reason.trim().length < 10) return setErr('Escreva o motivo com suas palavras (pelo menos uma frase). É ele que você vai reler depois.');
    setErr(null);
    const p = Number(f.price.replace(/\./g, '').replace(',', '.'));
    const entry: Entry = {
      id: `${Date.now()}`, date: today(), ticker: t, action: f.action, price: p > 0 ? p : priceNow(t), reason: f.reason.trim().slice(0, 2000), answers,
      revisit: plusMonths(Number(f.revisit) || 6), coolUntil: impulse && f.action !== 'Esperar' ? new Date(Date.now() + 24 * 3600_000).toISOString() : null, reviews: [],
    };
    setList((l) => [entry, ...l]);
    setF({ ticker: '', action: 'Comprar', price: '', reason: '', revisit: '6' }); setAnswers(QUESTIONS.map(() => false));
  };
  const review = (id: string, verdict: 'vale' | 'mudou') => {
    const note = window.prompt(verdict === 'vale' ? 'O que confirma que o motivo ainda vale? (opcional)' : 'O que mudou? (opcional)') ?? '';
    setList((l) => l.map((e) => (e.id === id ? { ...e, reviews: [...e.reviews, { date: today(), verdict, note: note.slice(0, 1000), price: priceNow(e.ticker) }] } : e)));
  };
  const due = dueReviews(list);

  return (
    <section aria-labelledby="jr-title" className="flex flex-col gap-4" data-testid="journal">
      <div>
        <h1 id="jr-title" className="flex items-center gap-2 text-xl font-semibold"><BookOpen size={20} className="text-gold-400" aria-hidden />Diário de decisões</h1>
        <p className="text-sm text-mist-400">Antes de comprar ou vender, anote o porquê. Na data marcada, o app pergunta: o motivo ainda vale? É o hábito que separa investidor de apostador.</p>
      </div>

      {due.length > 0 && (
        <div className="card p-4 ring-gold-500/40" role="status" data-testid="jr-due">
          <p className="text-sm font-medium text-gold-300">Hora de revisar {due.length === 1 ? '1 decisão' : `${due.length} decisões`}</p>
          <p className="text-xs text-mist-400">Releia o motivo abaixo e responda com calma.</p>
        </div>
      )}

      <form onSubmit={add} className="card flex flex-col gap-3 p-4" aria-label="Nova decisão">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-mist-400">Ativo<input className="input uppercase" value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value })} placeholder="PETR4" data-testid="jr-ticker" /></label>
          <label className="flex flex-col gap-1 text-xs text-mist-400">Decisão
            <select className="input" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as Action })} data-testid="jr-action">{(['Comprar', 'Vender', 'Manter', 'Esperar'] as Action[]).map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-mist-400">Preço (opcional)<NumInput className="input num" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder={priceNow(f.ticker.trim().toUpperCase())?.toFixed(2).replace('.', ',') ?? 'automático'} /></label>
          <label className="flex flex-col gap-1 text-xs text-mist-400">Revisar em
            <select className="input" value={f.revisit} onChange={(e) => setF({ ...f, revisit: e.target.value })}><option value="1">1 mês</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">1 ano</option></select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-mist-400">Por que estou tomando essa decisão?<textarea className="input min-h-[80px]" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex.: o fundo tem imóveis bem alugados, paga rendimento todo mês e completa a divisão que eu escolhi." data-testid="jr-reason" /></label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-mist-400">Antes de decidir, marque o que for verdade:</legend>
          {QUESTIONS.map((q, i) => (
            <label key={q} className="flex items-start gap-2 text-sm text-mist-200"><input type="checkbox" className="mt-1" checked={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.checked : x)))} data-testid={`jr-q${i}`} />{q}</label>
          ))}
        </fieldset>
        {impulse && f.action !== 'Esperar' && (
          <p className="flex items-start gap-2 rounded-lg bg-loss-500/10 p-3 text-xs text-loss-400" data-testid="jr-impulse"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />Atenção: sem reserva de emergência ou sob emoção/dica, o risco de arrependimento é maior. Sugestão: espere 24 horas antes de executar. Se registrar agora, o app marca um período de "esfriar a cabeça".</p>
        )}
        {f.action === 'Vender' && currentStorm().active && (
          <p className="rounded-lg bg-loss-500/10 p-3 text-xs text-loss-400" data-testid="jr-storm">A bolsa está em queda forte agora. Antes de vender, veja o <a className="underline" href="#/tempestade">Modo tempestade</a> e a promessa que você fez.</p>
        )}
        {err && <p className="text-xs text-loss-400" role="alert">{err}</p>}
        <button type="submit" className="btn btn-gold self-start" data-testid="jr-save">Registrar decisão</button>
      </form>

      <ul className="flex flex-col gap-3" data-testid="jr-list">
        {list.map((e) => {
          const now = priceNow(e.ticker);
          const chg = e.price && now ? now / e.price - 1 : null;
          const cooling = e.coolUntil && e.coolUntil > new Date().toISOString();
          const isDue = !e.reviews.length && e.revisit <= today();
          return (
            <li key={e.id} className={`card p-4 ${isDue ? 'ring-gold-500/50' : ''}`} data-id={e.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{e.action} {e.ticker} <span className="text-xs font-normal text-mist-500">em {br(e.date)}{e.price ? ` a ${brl(e.price)}` : ''}</span></p>
                <div className="flex items-center gap-2 text-xs">
                  {chg !== null && <span className={chg >= 0 ? 'text-gain-400' : 'text-loss-400'}>desde então: {chg >= 0 ? '+' : ''}{fmtPct(chg, 1)}</span>}
                  <button type="button" className="btn !px-1.5 !py-1" aria-label="Apagar decisão" onClick={() => window.confirm('Apagar esta anotação?') && setList((l) => l.filter((x) => x.id !== e.id))}><Trash2 size={12} aria-hidden /></button>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-mist-300">“{e.reason}”</p>
              <p className="mt-1 text-[11px] text-mist-500">Checklist: {e.answers.filter(Boolean).length}/{QUESTIONS.length} · revisar em {br(e.revisit)}</p>
              {cooling && <p className="mt-1 flex items-center gap-1 text-xs text-gold-300"><Clock size={12} aria-hidden />Esfriando a cabeça até {new Date(e.coolUntil!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>}
              {e.reviews.map((r, i) => <p key={i} className="mt-1 flex items-start gap-1 text-xs text-mist-300"><CheckCircle2 size={12} className={`mt-0.5 ${r.verdict === 'vale' ? 'text-gain-400' : 'text-gold-400'}`} aria-hidden />Revisado em {br(r.date)}: {r.verdict === 'vale' ? 'o motivo ainda vale' : 'o motivo mudou'}{r.note ? ` — ${r.note}` : ''}</p>)}
              {isDue && (
                <div className="mt-2 flex flex-wrap gap-2" data-testid="jr-review">
                  <button type="button" className="btn" onClick={() => review(e.id, 'vale')}>O motivo ainda vale</button>
                  <button type="button" className="btn" onClick={() => review(e.id, 'mudou')}>O motivo mudou</button>
                </div>
              )}
            </li>
          );
        })}
        {!list.length && <li className="text-xs text-mist-500">Nenhuma decisão registrada ainda.</li>}
      </ul>
      <p className="text-[11px] text-mist-500">As anotações ficam só neste aparelho. Ferramenta de disciplina pessoal — não é recomendação.</p>
    </section>
  );
}
