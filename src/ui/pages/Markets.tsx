import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Calculator, GraduationCap, KeyRound, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { CATALOG, GROUPS, INDICES, KIND_LABEL, REGION_LABEL, type CatalogItem } from '../../markets/catalog';
import { MONTHLY_BUDGET, changeOver, loadCache, marketOpen, refreshQuotes, type Quote } from '../../markets/quotes';
import { IS_WEB } from '../mode';
import { go } from '../route';
import { fmtPct } from '../format';
import { webBrapiToken } from '../../web/backend';

const DESKTOP_KEY = 'mxrf:brapiKey';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 });
const pts = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtPct(v, 2)}`);
const tone = (v: number | null) => (v === null || v === 0 ? 'text-mist-400' : v > 0 ? 'text-gain-400' : 'text-loss-400');

function readToken(): string | null {
  if (IS_WEB) return webBrapiToken();
  try { return JSON.parse(localStorage.getItem(DESKTOP_KEY) ?? 'null'); } catch { return null; }
}

/** Mini gráfico dos últimos 3 meses (só o desenho; os números estão ao lado). */
function Spark({ closes, up }: { closes: number[]; up: boolean }) {
  if (closes.length < 5) return <span className="inline-block h-7 w-20" />;
  const min = Math.min(...closes), max = Math.max(...closes), w = 80, h = 28;
  const d = closes.map((c, i) => `${i ? 'L' : 'M'}${((i / (closes.length - 1)) * w).toFixed(1)},${(h - ((c - min) / (max - min || 1)) * (h - 2) - 1).toFixed(1)}`).join('');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={up ? 'text-gain-400' : 'text-loss-400'}><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function Change({ v, big = false }: { v: number | null; big?: boolean }) {
  const Icon = v === null || v === 0 ? null : v > 0 ? ArrowUp : ArrowDown;
  return <span className={`inline-flex items-center gap-0.5 font-medium ${tone(v)} ${big ? 'text-sm' : 'text-xs'}`}>{Icon && <Icon size={big ? 14 : 12} aria-hidden />}{pct(v)}</span>;
}

function Row({ item, q }: { item: CatalogItem; q?: Quote }) {
  const day = q?.changePct ?? null;
  const m3 = changeOver(q, 65);
  return (
    <li className="flex items-center gap-3 border-t border-white/5 py-2.5 first:border-t-0" data-symbol={item.symbol}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist-100">{item.name}</p>
        <p className="truncate text-[11px] text-mist-500">{item.symbol} · {item.sector}{item.note ? ` · ${item.note}` : ''}</p>
      </div>
      <div className="hidden sm:block"><Spark closes={q ? [...q.closes, q.price] : []} up={(m3 ?? 0) >= 0} /></div>
      <div className="w-28 text-right">
        <p className="num text-sm text-mist-100">{q ? (item.kind === 'INDICE' ? pts(q.price) : brl(q.price)) : '—'}</p>
        <p className="text-[11px]"><Change v={day} /> <span className="text-mist-500">hoje</span></p>
      </div>
      <div className="hidden w-24 text-right text-[11px] md:block">
        <p><span className="text-mist-500">1 mês </span><span className={tone(changeOver(q, 21))}>{pct(changeOver(q, 21))}</span></p>
        <p><span className="text-mist-500">3 meses </span><span className={tone(m3)}>{pct(m3)}</span></p>
      </div>
      {(item.kind === 'ACAO' || item.kind === 'FII') && (
        <button type="button" className="btn hidden px-2 py-1 text-[11px] lg:inline-flex" onClick={() => go('simulador', { t: item.symbol })} title="Simular reinvestimento"><Calculator size={12} aria-hidden />Simular</button>
      )}
    </li>
  );
}

const MENTORS: { who: string; idea: string }[] = [
  { who: 'Benjamin Graham', idea: 'Margem de segurança: pague menos do que o negócio vale e nunca conte com o melhor cenário.' },
  { who: 'Warren Buffett', idea: 'Invista só no que você entende e pense em anos, não em dias. O preço oscila; o negócio é o que importa.' },
  { who: 'John Bogle', idea: 'Diversifique com custo baixo. Fundos de índice (ETFs) dão acesso a centenas de empresas de uma vez.' },
  { who: 'Peter Lynch', idea: 'Conheça a empresa antes de comprar: como ela ganha dinheiro, quanto deve e se o lucro cresce.' },
  { who: 'Luiz Barsi', idea: 'Renda passiva vem de juntar boas pagadoras de rendimentos e reinvestir os proventos com paciência.' },
  { who: 'Ray Dalio', idea: 'Não dependa de uma única aposta: misture classes (renda fixa, ações, exterior, ouro) que reagem diferente às crises.' },
];

export function MarketsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [q, setQ] = useState('');
  const [quotes, setQuotes] = useState(() => loadCache());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const running = useRef(false);

  // garante que as configurações do aparelho foram lidas antes de procurar a chave
  useEffect(() => { void fetch('/api/settings').catch(() => null).finally(() => { setToken(readToken()); setChecked(true); }); }, []);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (qq) return CATALOG.filter((i) => i.symbol.toLowerCase().includes(qq) || i.name.toLowerCase().includes(qq) || i.sector.toLowerCase().includes(qq));
    return CATALOG.filter(GROUPS.find((g) => g.id === group)!.filter);
  }, [group, q]);

  const refresh = useCallback(async (force = false) => {
    if (!token || running.current) return;
    running.current = true; setNote(null);
    const syms = [...INDICES.map((i) => i.symbol), 'IVVB11', 'GOLD11', ...visible.map((i) => i.symbol)];
    const r = await refreshQuotes([...new Set(syms)], token, { force, onProgress: (d, t) => setBusy(`Atualizando ${d}/${t}…`) });
    setQuotes(loadCache()); setBusy(null); running.current = false;
    if (r.stopped) setNote(r.stopped);
    else if (r.failed.length) setNote(`Sem cotação agora para: ${r.failed.join(', ')}.`);
  }, [token, visible]);
  useEffect(() => { void refresh(); }, [refresh]);

  const saveKey = async () => {
    const k = keyInput.trim();
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(k)) return setNote('Essa chave não parece válida. Copie de novo na brapi (só letras e números).');
    if (IS_WEB) await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mxrf11' }, body: JSON.stringify({ brapiToken: k }) });
    else localStorage.setItem(DESKTOP_KEY, JSON.stringify(k));
    setKeyInput(''); setToken(readToken() ?? k);
  };

  const all = [...INDICES, ...CATALOG];
  const movers = all.filter((i) => i.kind !== 'INDICE' && quotes.q[i.symbol]?.changePct != null).map((i) => ({ i, v: quotes.q[i.symbol].changePct! }));
  const ups = [...movers].sort((a, b) => b.v - a.v).filter((m) => m.v > 0).slice(0, 5);
  const downs = [...movers].sort((a, b) => a.v - b.v).filter((m) => m.v < 0).slice(0, 5);
  const last = Object.values(quotes.q).reduce((m, x) => Math.max(m, x.fetchedAt), 0);
  const sectors = [...new Set(visible.map((i) => i.sector))];
  const headline = [INDICES[0], INDICES[1], CATALOG.find((i) => i.symbol === 'IVVB11')!, CATALOG.find((i) => i.symbol === 'GOLD11')!];

  return (
    <section aria-labelledby="mk-title" className="flex flex-col gap-4" data-testid="markets">
      <div>
        <h1 id="mk-title" className="text-xl font-semibold">Mercados</h1>
        <p className="text-sm text-mist-400">As principais ações, fundos e ETFs do Brasil e do mundo, com preço, se subiu ou caiu hoje e nos últimos meses. Empresas estrangeiras aparecem como BDR (negociadas na B3, em reais).</p>
      </div>

      {checked && !token && (
        <div className="card flex flex-col gap-3 p-5 ring-gold-500/30" data-testid="mk-setup">
          <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound size={16} className="text-gold-400" aria-hidden />Ative as cotações (uma vez, grátis, ~2 minutos)</h2>
          <ol className="list-decimal pl-5 text-sm text-mist-300">
            <li>Abra <a className="text-gold-300 underline" href="https://brapi.dev/" target="_blank" rel="noreferrer">brapi.dev</a> e toque em entrar. Pode entrar com <b>Google (Gmail)</b> ou <b>GitHub</b> — tanto faz; use o que for mais fácil para você.</li>
            <li>Escolha o plano <b>gratuito</b> e copie a sua <b>chave (token)</b> no painel.</li>
            <li>Cole aqui e toque em <b>Salvar</b>.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" placeholder="Cole sua chave da brapi" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} data-testid="mk-key" autoComplete="off" />
            <button type="button" className="btn btn-gold" onClick={saveKey} data-testid="mk-save">Salvar</button>
          </div>
          <p className="text-xs text-mist-500">A chave é sua e fica só neste aparelho. Cada pessoa da família cria a própria. Não compartilhe sua chave com ninguém.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="mk-headline">
        {headline.map((i) => {
          const x = quotes.q[i.symbol];
          return (
            <div key={i.symbol} className="card p-3">
              <p className="text-[11px] text-mist-500">{i.kind === 'INDICE' ? i.name : i.symbol === 'IVVB11' ? 'Bolsa dos EUA (S&P 500)' : 'Ouro'}</p>
              <p className="num text-base font-semibold">{x ? (i.kind === 'INDICE' ? pts(x.price) : brl(x.price)) : '—'}</p>
              <Change v={x?.changePct ?? null} big />
            </div>
          );
        })}
      </div>

      {(ups.length > 0 || downs.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="mk-movers">
          {[{ t: 'Mais subiram hoje', l: ups, I: TrendingUp, c: 'text-gain-400' }, { t: 'Mais caíram hoje', l: downs, I: TrendingDown, c: 'text-loss-400' }].map(({ t, l, I, c }) => (
            <div key={t} className="card p-4">
              <h2 className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${c}`}><I size={15} aria-hidden />{t}</h2>
              {l.length ? <ul>{l.map(({ i, v }) => <li key={i.symbol} className="flex justify-between py-0.5 text-xs"><span className="truncate text-mist-200">{i.name} <span className="text-mist-500">{i.symbol}</span></span><Change v={v} /></li>)}</ul> : <p className="text-xs text-mist-500">Nenhum entre os já carregados.</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Buscar empresa, código ou setor</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" aria-hidden />
            <input className="input w-full pl-9" placeholder="Buscar: Apple, PETR4, bancos…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="mk-search" />
          </label>
          {token && <button type="button" className="btn" onClick={() => refresh(true)} disabled={Boolean(busy)} data-testid="mk-refresh"><RefreshCw size={14} aria-hidden className={busy ? 'animate-spin' : ''} />{busy ?? 'Atualizar'}</button>}
        </div>
        {!q && (
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Grupos">
            {GROUPS.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ring-1 ${group === g.id ? 'bg-gold-500 text-ink-950 ring-gold-500' : 'text-mist-300 ring-white/10'}`}>{g.label}</button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-mist-500" role="status">
          {last ? `Atualizado às ${new Date(last).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${new Date(last).toLocaleDateString('pt-BR')}` : 'Ainda sem cotações neste aparelho'}
          {' · '}{marketOpen() ? 'Bolsa aberta — preços com atraso de cerca de 30 min' : 'Bolsa fechada — último fechamento'}
          {token ? ` · ${quotes.used.toLocaleString('pt-BR')}/${MONTHLY_BUDGET.toLocaleString('pt-BR')} consultas no mês` : ''}
        </p>
        {note && <p className="text-xs text-gold-300" role="alert">{note}</p>}
      </div>

      <div className="flex flex-col gap-3" data-testid="mk-list">
        {(q ? ['Resultados'] : sectors).map((sec) => {
          const items = q ? visible : visible.filter((i) => i.sector === sec);
          return (
            <div key={sec} className="card px-4 py-2">
              <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-mist-400">{sec}{!q && items[0] ? ` · ${REGION_LABEL[items[0].region]}` : ''}</h2>
              <ul>{items.map((i) => <Row key={i.symbol} item={i} q={quotes.q[i.symbol]} />)}</ul>
            </div>
          );
        })}
        {q && !visible.length && <p className="card p-4 text-sm text-mist-400">Nada encontrado. Para qualquer ativo da B3, use <button type="button" className="underline" onClick={() => go('explorar')}>a tabela completa</button>.</p>}
      </div>

      <details className="card p-4" data-testid="mk-mentors">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><GraduationCap size={16} className="text-gold-400" aria-hidden />O que os grandes investidores ensinam</summary>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {MENTORS.map((m) => <li key={m.who} className="rounded-lg bg-ink-850 p-3 text-xs text-mist-300"><b className="text-mist-100">{m.who}:</b> {m.idea}</li>)}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Antes de comprar qualquer ação</h3>
        <ol className="mt-1 list-decimal pl-5 text-xs leading-relaxed text-mist-300">
          <li>Tenha uma reserva de emergência (6 a 12 meses de gastos) em renda fixa com liquidez diária.</li>
          <li>Invista só dinheiro que pode ficar parado por anos; ações sobem e caem muito no curto prazo.</li>
          <li>Diversifique: várias empresas e setores, Brasil e exterior. Um ETF já faz isso por você.</li>
          <li>Entenda o que está comprando e compare custos (corretagem, taxa de administração, impostos).</li>
          <li>Subir ou cair hoje não diz se é bom ou ruim: olhe o negócio e o longo prazo.</li>
        </ol>
      </details>

      <p className="text-[11px] text-mist-500">Lista objetiva das maiores e mais negociadas empresas e fundos — não é recomendação de compra ou venda. Tipos: {Object.values(KIND_LABEL).join(', ')}. Cotações: brapi.dev (fontes públicas, sem vínculo com a B3, com atraso e sem garantia), com a sua chave pessoal, consultadas direto deste aparelho e guardadas só nele. Rentabilidade passada não garante resultado futuro.</p>
    </section>
  );
}
