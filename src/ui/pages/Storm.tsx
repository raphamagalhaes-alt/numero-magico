import { useState } from 'react';
import { Anchor, CloudLightning, LifeBuoy, Sun } from 'lucide-react';
import { PAST_STORMS, extraShares, reserveCoverMonths } from '../../engine/storm';
import { currentStorm } from '../storm-state';
import { loadCache } from '../../markets/quotes';
import { useUniverse } from '../data';
import { fmtBRL, fmtPct } from '../format';
import { go } from '../route';
import { loadRaw, save } from '../storage';
import { num, useFreedomPlan } from '../freedom-plan';
import { loadPositions } from './Portfolio';
import { loadJournal } from './Journal';
import { loadPayday } from './Month';
import { splitPayday, effectivePct } from '../../engine/payday';

const RULE_KEY = 'mxrf:stormRule';
const brl = (v: number) => fmtBRL(v.toFixed(2));

export function StormPage() {
  const u = useUniverse();
  const plan = useFreedomPlan();
  const storm = currentStorm();
  const [rule, setRule] = useState(() => loadRaw<string>(RULE_KEY, ''));
  const [draft, setDraft] = useState(rule);
  const pay = loadPayday();
  const reserve = num(pay.reserveHave);
  const cover = reserveCoverMonths(reserve, plan.cov.total);
  const split = splitPayday({ salary: num(pay.salary), pct: effectivePct(num(pay.pct), pay.raise, new Date().toISOString().slice(0, 10)).pct, reserveHave: reserve, reserveTarget: Infinity, reserveShare: 0 });
  const monthlyMoney = pay.configured ? split.save : plan.contribution;
  const mk = loadCache().q;
  const holdings = loadPositions().map((p) => {
    const m = mk[p.ticker];
    const price = m?.price ?? u.data?.assets.find((a) => a.ticker === p.ticker)?.close ?? null;
    const peak = m && m.closes.length ? Math.max(...m.closes, m.price) : null;
    return { ...p, price, peak, fall: price && peak ? price / peak - 1 : null };
  });
  const value = holdings.reduce((s, h) => s + (h.price ?? 0) * h.shares, 0);
  const fallen = holdings.filter((h) => h.fall !== null && h.fall <= -0.05).sort((a, b) => a.fall! - b.fall!);
  const buys = loadJournal().filter((e) => e.action === 'Comprar').slice(0, 3);
  const practice = 0.3;

  return (
    <section aria-labelledby="st-title" className="flex flex-col gap-4" data-testid="storm">
      <div>
        <h1 id="st-title" className="flex items-center gap-2 text-xl font-semibold">{storm.active ? <CloudLightning size={20} className="text-loss-400" aria-hidden /> : <Sun size={20} className="text-gold-400" aria-hidden />}Modo tempestade</h1>
        <p className="text-sm text-mist-400">O momento em que mais se perde dinheiro é vendendo no pânico. Aqui você troca o susto pelos seus próprios números.</p>
      </div>

      {storm.active ? (
        <div className="card p-5 ring-loss-500/40" data-testid="st-active">
          <p className="text-lg font-semibold text-loss-400">Queda forte na última cotação disponível</p>
          <p className="text-sm text-mist-300">
            {storm.dayPct !== null && storm.dayPct <= -0.02 && <>Ibovespa {fmtPct(storm.dayPct, 1)} na variação informada. </>}
            {storm.drawdown !== null && storm.drawdown <= -0.1 && <>{fmtPct(-storm.drawdown, 1)} abaixo do ponto mais alto dos últimos 3 meses.</>}
          </p>
          <p className="mt-2 text-sm text-mist-200"><b>Respire. Nenhuma decisão precisa ser tomada hoje.</b></p>
        </div>
      ) : (
        <div className="card p-5" data-testid="st-calm">
          <p className="text-base font-semibold text-gold-300">{storm.hasData ? 'Sem sinal de queda forte nos dados disponíveis' : 'Sem dados recentes para avaliar o mercado'}</p>
          <p className="text-sm text-mist-400">{storm.hasData ? <>Ibovespa {storm.dayPct !== null ? `${storm.dayPct >= 0 ? '+' : ''}${fmtPct(storm.dayPct, 1)} na variação informada` : ''}{storm.drawdown !== null ? ` · ${fmtPct(-storm.drawdown, 1)} abaixo do pico de 3 meses` : ''}.</> : <>Ative as cotações em <button type="button" className="underline" onClick={() => go('mercados')}>Mercados</button> para o app avisar sozinho quando a bolsa cair forte.</>} O melhor momento para se preparar para a tempestade é agora.</p>
        </div>
      )}

      {storm.referenceLabel && <p className="text-xs text-mist-500" data-testid="st-reference">{storm.referenceKind}: {storm.referenceLabel} (Brasília).{!storm.hasData ? ' Dados antigos; atualize em Mercados antes de avaliar a situação.' : ' A variação se refere a esse registro, não necessariamente ao pregão de hoje.'}</p>}

      <div className="card flex flex-col gap-2 p-4 ring-gold-500/30" data-testid="st-rule">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Anchor size={16} className="text-gold-400" aria-hidden />Minha promessa para as quedas</h2>
        {storm.active && rule && <p className="rounded-lg bg-ink-850 p-3 text-sm text-mist-100" data-testid="st-promise">Você prometeu a si mesmo, com a cabeça fria: <b>“{rule}”</b></p>}
        <p className="text-xs text-mist-400">Escreva agora, com calma, o que você vai fazer quando a bolsa cair 20% ou 30%. Como Ulisses, que se amarrou ao mastro antes de ouvir o canto das sereias.</p>
        <textarea className="input min-h-[70px]" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: Não vou vender nada. Vou manter meus aportes do Meu mês e reler meu Diário." data-testid="st-rule-input" />
        <button type="button" className="btn btn-gold self-start" onClick={() => { save(RULE_KEY, draft.trim().slice(0, 500)); setRule(draft.trim().slice(0, 500)); }} data-testid="st-rule-save">Salvar minha promessa</button>
        {rule && !storm.active && <p className="text-[11px] text-gain-400">Promessa salva. Ela vai aparecer aqui quando a tempestade chegar.</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-2 p-4" data-testid="st-numbers">
          <h2 className="flex items-center gap-2 text-base font-semibold"><LifeBuoy size={16} className="text-gold-400" aria-hidden />Seus números, não as manchetes</h2>
          <ul className="flex flex-col gap-2 text-sm text-mist-300">
            <li>{cover !== null ? <>Sua reserva de emergência cobre <b className="text-mist-100">{cover.toLocaleString('pt-BR')} meses</b> das suas contas. {cover >= 6 ? 'Você não precisa vender nada para pagar as contas.' : 'Enquanto ela não estiver completa, evite depender de vender ações.'}</> : <>Configure sua reserva em <button type="button" className="underline" onClick={() => go('mes')}>Meu mês</button>.</>}</li>
            {plan.pf.income > 0 && <li>Seus investimentos estimam pagar <b className="text-mist-100">{brl(plan.pf.income)} por mês</b> em rendimentos. Rendimentos costumam oscilar bem menos que o preço das cotas.</li>}
            {value > 0 && <li>Uma queda de 30% deixaria sua carteira de {brl(value)} em <b className="text-mist-100">{brl(value * (1 - practice))}</b> em valor de mercado. A perda ainda não realizada pode persistir; uma recuperação não é garantida.</li>}
            {monthlyMoney > 0 && fallen.length > 0 && fallen.slice(0, 3).map((h) => { const x = extraShares(monthlyMoney, h.price!, h.peak!); return x.extra > 0 ? <li key={h.ticker}>Com {h.ticker} {fmtPct(-h.fall!, 0)} abaixo do pico, seus {brl(monthlyMoney)} do mês compram <b className="text-gain-400">{x.extra} cota{x.extra > 1 ? 's' : ''} a mais</b> ({x.now} em vez de {x.before}).</li> : null; })}
          </ul>
        </div>
        <div className="card flex flex-col gap-2 p-4" data-testid="st-history">
          <h2 className="text-base font-semibold">Tempestades que já passaram</h2>
          <ul className="flex flex-col gap-2 text-sm">{PAST_STORMS.map((p) => <li key={p.when} className="rounded-lg bg-ink-850 p-3"><b className="text-mist-100">{p.when}:</b> <span className="text-mist-300">{p.what}</span> <span className="text-gain-400">{p.after}</span></li>)}</ul>
          <p className="text-[11px] text-mist-500">Valores aproximados. Recuperações passadas não garantem recuperações futuras, nem o prazo delas — por isso diversificação e reserva importam.</p>
        </div>
      </div>

      {buys.length > 0 && (
        <div className="card p-4" data-testid="st-journal">
          <h2 className="text-base font-semibold">Por que você comprou (do seu Diário)</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-mist-300">{buys.map((e) => <li key={e.id}><b className="text-mist-100">{e.ticker}</b> ({e.date.split('-').reverse().join('/')}): “{e.reason}”</li>)}</ul>
          <p className="mt-2 text-xs text-mist-400">O motivo mudou, ou só o preço? Se foi só o preço, a decisão de hoje pode ser não fazer nada.</p>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-base font-semibold">Se ainda assim quiser agir</h2>
        <ol className="mt-1 list-decimal pl-5 text-sm text-mist-300">
          <li>Espere 24 horas. Registre a ideia no <button type="button" className="underline" onClick={() => go('diario')}>Diário</button> e leia de novo amanhã.</li>
          <li>Pergunte: o motivo da compra mudou? A empresa ou o fundo piorou de verdade, ou só o preço caiu?</li>
          <li>Venda só o que estiver fora do seu plano, nunca por causa da manchete do dia.</li>
          <li>Se precisar de orientação personalizada, procure um profissional certificado.</li>
        </ol>
      </div>
      <p className="text-[11px] text-mist-500">Ferramenta de comportamento e educação. Não prevê o mercado e não é recomendação de compra ou venda.</p>
    </section>
  );
}
