import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, CloudLightning, Download, KeyRound, ShieldCheck, Sunrise, Upload, User, Users, Wallet, Baby, Compass } from 'lucide-react';
import { PROFILE_QUESTIONS, buildBackup, parseBackup, scoreProfile, type InvestorProfile } from '../backup';
import { payDate, streak } from '../../engine/payday';
import { loadCache, MONTHLY_BUDGET } from '../../markets/quotes';
import { fmtBRL, fmtPct } from '../format';
import { go, type Page } from '../route';
import { loadRaw, save } from '../storage';
import { useFreedomPlan, num } from '../freedom-plan';
import { eraseLocalData, TERMS_KEY } from '../legal';
import { IS_WEB } from '../mode';
import { webBrapiToken } from '../../web/backend';
import { loadPositions } from './Portfolio';
import { dueReviews, loadJournal } from './Journal';
import { loadPayday } from './Month';

export const NAME_KEY = 'mxrf:familyName';
export const AVATAR_KEY = 'mxrf:avatar';
const QUIZ_KEY = 'mxrf:investorProfile';
const AVATARS = ['🙂', '😎', '👩', '👨', '👵', '👴', '🧑‍💼', '🦊', '🦁', '🐢', '🌻', '⭐'];
const brl = (v: number) => fmtBRL(v.toFixed(2));
const br = (iso: string) => iso.split('-').reverse().join('/');
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Avatar mostrado no topo de todas as telas. */
export function AvatarBadge({ size = 36 }: { size?: number }) {
  const name = loadRaw<string>(NAME_KEY, '');
  const emoji = loadRaw<string>(AVATAR_KEY, '');
  return <span className="grid shrink-0 place-items-center rounded-full bg-ink-700 font-semibold text-gold-300 ring-1 ring-gold-500/40" style={{ width: size, height: size, fontSize: emoji ? size * 0.55 : size * 0.38 }} aria-hidden>{emoji || initials(name || 'Eu')}</span>;
}

const PROFILE_TEXT: Record<InvestorProfile, string> = {
  Conservador: 'Você prioriza não perder dinheiro. Faz sentido focar em reserva de emergência e renda fixa (Tesouro Selic, CDBs de bancos sólidos) e, se quiser, uma parte pequena em renda variável para aprender.',
  Moderado: 'Você busca equilíbrio. Uma base sólida em renda fixa com uma parte em fundos imobiliários, ações ou ETFs costuma combinar com esse perfil, sempre com a reserva completa antes.',
  Arrojado: 'Você aceita sustos em troca de mais retorno no longo prazo. Mesmo assim: reserva completa primeiro, diversificação e a promessa do Modo tempestade escrita.',
};

export function ProfilePage() {
  const plan = useFreedomPlan();
  const [name, setName] = useState(() => loadRaw<string>(NAME_KEY, ''));
  const [avatar, setAvatar] = useState(() => loadRaw<string>(AVATAR_KEY, ''));
  const [quiz, setQuiz] = useState<{ answers: number[]; result: InvestorProfile | null; date?: string }>(() => loadRaw(QUIZ_KEY, { answers: [], result: null }));
  const [quizOpen, setQuizOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [withKey, setWithKey] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [watch, setWatch] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // salva e avisa o topo da tela (avatar e "Olá") para atualizar na hora
  useEffect(() => { save(NAME_KEY, name.slice(0, 30)); window.dispatchEvent(new Event('nm:profile')); }, [name]);
  useEffect(() => { save(AVATAR_KEY, avatar); window.dispatchEvent(new Event('nm:profile')); }, [avatar]);
  useEffect(() => { void fetch('/api/settings').then((r) => r.json()).then((s: { watchlist?: string[] }) => setWatch(s.watchlist ?? [])).catch(() => undefined); }, []);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const ym = today.slice(0, 7);
  const pay = loadPayday();
  const st = streak(pay.history.map((h) => h.ym), ym);
  const reserveTarget = num(pay.reserveMonths) * plan.cov.total;
  const journal = loadJournal();
  const kids = loadRaw<unknown[]>('mxrf:kids', []);
  const family = loadRaw<unknown[]>('mxrf:family', []);
  const rule = loadRaw<string>('mxrf:stormRule', '');
  const terms = loadRaw<string>(TERMS_KEY, '');
  const token = IS_WEB ? webBrapiToken() : loadRaw<string | null>('mxrf:brapiKey', null);
  const mk = loadCache();
  const positions = loadPositions();
  const since = loadRaw<string>('mxrf:since', today);

  const card = (to: Page, Icon: typeof User, title: string, main: React.ReactNode, sub: React.ReactNode, testId?: string) => (
    <button type="button" onClick={() => go(to)} className="card flex flex-col gap-1 p-4 text-left transition hover:ring-gold-500/40" data-testid={testId}>
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-mist-500"><Icon size={13} className="text-gold-400" aria-hidden />{title}</span>
      <span className="num text-lg font-semibold text-mist-100">{main}</span>
      <span className="text-[11px] text-mist-400">{sub}</span>
    </button>
  );

  const download = async () => {
    const dev = { brapiToken: token, watchlist: watch };
    const b = buildBackup(localStorage, dev, withKey);
    const blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `numero-magico-copia-${today}.json`; a.click();
    setMsg('Cópia baixada. Guarde o arquivo em lugar seguro (ele tem seus dados financeiros).');
  };
  const restore = async (file: File) => {
    const r = parseBackup(await file.text());
    if (!r.ok) return setMsg(r.error);
    if (!window.confirm(`Restaurar a cópia de ${r.backup.createdAt.slice(0, 10).split('-').reverse().join('/')}? Os dados atuais deste aparelho serão substituídos.`)) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith('mxrf:') && k !== TERMS_KEY) localStorage.removeItem(k);
    for (const k of r.keys) localStorage.setItem(k, JSON.stringify(r.backup.data[k]));
    if (r.backup.device) await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mxrf11' }, body: JSON.stringify({ watchlist: r.backup.device.watchlist, ...(r.backup.device.brapiToken ? { brapiToken: r.backup.device.brapiToken } : {}) }) }).catch(() => undefined);
    setMsg('Cópia restaurada! Recarregando…');
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <section aria-labelledby="pr-title" className="flex flex-col gap-4" data-testid="profile">
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-700 text-3xl font-semibold text-gold-300 ring-2 ring-gold-500/50" aria-hidden>{avatar || initials(name || 'Eu')}</span>
        <div className="min-w-0 flex-1">
          <h1 id="pr-title" className="text-xl font-semibold">{name ? `Olá, ${name}!` : 'Meu perfil'}</h1>
          <p className="text-xs text-mist-400">Usando o Número Mágico desde {br(since)}. Tudo aqui fica só neste aparelho.</p>
          <label className="mt-2 flex max-w-xs flex-col gap-1 text-xs text-mist-400">Como quer ser chamado(a)?<input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Seu nome ou apelido" data-testid="pr-name" /></label>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Escolha seu avatar">
          <button type="button" onClick={() => setAvatar('')} className={`h-9 w-9 rounded-full text-xs ring-1 ${!avatar ? 'ring-gold-400' : 'ring-white/10'}`} aria-label="Usar iniciais">{initials(name || 'Eu')}</button>
          {AVATARS.map((a) => <button key={a} type="button" onClick={() => setAvatar(a)} className={`h-9 w-9 rounded-full text-lg ring-1 ${avatar === a ? 'ring-gold-400' : 'ring-white/10'}`} aria-label={`Avatar ${a}`}>{a}</button>)}
        </div>
      </div>

      <h2 className="text-base font-semibold">Minhas coisas</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" data-testid="pr-summary">
        {card('liberdade', Sunrise, 'Liberdade', fmtPct(plan.cov.pct, 0), plan.cov.covered.length ? `Já pagam: ${plan.cov.covered.map((b) => b.name).join(', ')}` : `Contas da casa: ${brl(plan.cov.total)}/mês`, 'pr-freedom')}
        {card('carteira', Wallet, 'Carteira', brl(plan.pf.value), positions.length && !plan.pf.value ? `${positions.length} ativo${positions.length === 1 ? '' : 's'} · sem cotação ainda (ative em Mercados)` : `${positions.length} ativo${positions.length === 1 ? '' : 's'} · renda ${brl(plan.pf.income)}/mês`, 'pr-wallet')}
        {card('mes', CalendarCheck, 'Meu mês', pay.configured ? `${st} ${st === 1 ? 'mês seguido' : 'meses seguidos'}` : 'Configurar', pay.configured ? `Salário ${brl(num(pay.salary))} · próximo pagamento ${br(today >= payDate(ym, pay.rule) ? payDate(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)).toISOString().slice(0, 7), pay.rule) : payDate(ym, pay.rule))}` : 'Pague-se primeiro no dia do salário', 'pr-month')}
        {card('mes', ShieldCheck, 'Reserva de emergência', brl(num(pay.reserveHave)), reserveTarget > 0 ? `${fmtPct(Math.min(1, num(pay.reserveHave) / reserveTarget), 0)} da meta de ${brl(reserveTarget)}` : 'Defina em Meu mês')}
        {card('diario', BookOpen, 'Diário', `${journal.length} decis${journal.length === 1 ? 'ão' : 'ões'}`, dueReviews(journal).length ? `${dueReviews(journal).length} para revisar agora` : 'Nada para revisar')}
        {card('filhos', Baby, 'Filhos', `${kids.length} meta${kids.length === 1 ? '' : 's'}`, kids.length ? 'Ver a árvore do dinheiro' : 'Começar o investimento deles')}
        {card('tempestade', CloudLightning, 'Promessa para quedas', rule ? 'Escrita ✓' : 'Ainda não', rule ? `“${rule.slice(0, 60)}${rule.length > 60 ? '…' : ''}”` : 'Escreva com a cabeça fria')}
        {card('liberdade', Users, 'Família', `${family.length} pessoa${family.length === 1 ? '' : 's'}`, 'no seu quadro de metas')}
        {card(IS_WEB ? 'mercados' : 'dados', KeyRound, 'Cotações', token ? `Chave …${token.slice(-4)}` : 'Sem chave', token ? `${mk.used.toLocaleString('pt-BR')}/${MONTHLY_BUDGET.toLocaleString('pt-BR')} consultas no mês` : 'Ative grátis em Mercados', 'pr-quotes')}
      </div>

      <div className="card flex flex-col gap-3 p-4" data-testid="pr-quiz">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Compass size={16} className="text-gold-400" aria-hidden />Meu perfil de investidor</h2>
        {quiz.result && !quizOpen && (
          <div>
            <p className="text-lg font-semibold text-gold-300" data-testid="pr-quiz-result">{quiz.result}</p>
            <p className="text-sm text-mist-300">{PROFILE_TEXT[quiz.result]}</p>
            {quiz.date && <p className="text-[11px] text-mist-500">Respondido em {br(quiz.date)}. Refaça quando sua vida mudar.</p>}
          </div>
        )}
        {quizOpen ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const r = scoreProfile(draft); if (!r) return setMsg('Responda todas as perguntas.'); const v = { answers: draft, result: r, date: today }; setQuiz(v); save(QUIZ_KEY, v); setQuizOpen(false); setMsg(null); }}>
            {PROFILE_QUESTIONS.map((q, i) => (
              <fieldset key={q.q} className="flex flex-col gap-1">
                <legend className="mb-1 text-sm text-mist-200">{i + 1}. {q.q}</legend>
                {q.options.map(([label, v]) => <label key={label} className="flex items-center gap-2 text-sm text-mist-300"><input type="radio" name={`q${i}`} checked={draft[i] === v} onChange={() => setDraft((d) => { const n = [...d]; n[i] = v; return n; })} data-testid={`pr-q${i}-${v}`} />{label}</label>)}
              </fieldset>
            ))}
            <button type="submit" className="btn btn-gold self-start" data-testid="pr-quiz-save">Ver meu perfil</button>
          </form>
        ) : <button type="button" className="btn self-start" onClick={() => { setDraft(quiz.answers); setQuizOpen(true); }} data-testid="pr-quiz-start">{quiz.result ? 'Refazer o teste' : 'Fazer o teste (1 minuto)'}</button>}
        <p className="text-[11px] text-mist-500">Teste educativo para você se conhecer. Não substitui o questionário oficial de perfil (suitability) da sua corretora e não é recomendação.</p>
      </div>

      <div className="card flex flex-col gap-3 p-4" data-testid="pr-backup">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Download size={16} className="text-gold-400" aria-hidden />Cópia de segurança e troca de celular</h2>
        <p className="text-xs text-mist-400">Seus dados ficam só neste aparelho. Para levar tudo a um celular ou computador novo (ou se precaver), baixe uma cópia e depois restaure no outro aparelho.</p>
        <label className="flex items-center gap-2 text-xs text-mist-300"><input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />Incluir minha chave da brapi na cópia (guarde o arquivo com cuidado)</label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" onClick={download} data-testid="pr-download"><Download size={14} aria-hidden />Baixar cópia dos meus dados</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden />Restaurar de uma cópia</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="pr-restore" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={16} className="text-gold-400" aria-hidden />Privacidade</h2>
        <p className="text-xs text-mist-400">{terms ? `Termos aceitos (versão ${terms}).` : 'Termos ainda não aceitos.'} Nenhum dado pessoal sai deste aparelho, a não ser o que você mesmo compartilhar.</p>
        <div className="flex flex-wrap gap-2">
          <a href="#/termos" className="btn">Ver termos e privacidade</a>
          <button type="button" className="btn" onClick={async () => { if (!window.confirm('Apagar TODOS os seus dados deste aparelho (carteira, metas, diário, chave)? Faça uma cópia antes, se quiser guardar.')) return; await eraseLocalData(); window.location.reload(); }} data-testid="pr-erase">Apagar meus dados deste aparelho</button>
        </div>
      </div>
      {msg && <p className="text-sm text-gold-300" role="status">{msg}</p>}
    </section>
  );
}
