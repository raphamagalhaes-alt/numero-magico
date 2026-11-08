import { useState } from 'react';
import { AlertTriangle, Clock, Loader2, RefreshCw, Database, PencilLine } from 'lucide-react';
import type { DividendEvent, MarketSnapshot, MarketStatus } from '../../market/types';
import { defaultDividend } from '../../market/types';
import { manualSnapshot } from '../../market/client';
import { parseBR } from '../form';
import { fmtBRLPrecise } from '../format';

const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
const d = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

const safeUrl = (u?: string) => (u && /^https:\/\//i.test(u) ? u : undefined);
function Src({ s, url: raw }: { s: string; url?: string }) {
  const url = safeUrl(raw);
  return <span className="text-[11px] text-mist-500">Fonte: {url ? <a className="underline hover:text-gold-300" href={url} target="_blank" rel="noreferrer noopener">{s}</a> : s}</span>;
}

function DivBlock({ title, ev, highlight }: { title: string; ev: DividendEvent | null; highlight?: boolean }) {
  return (
    <div className={`rounded-lg bg-ink-850 p-3 ring-1 ${highlight ? 'ring-gold-500/40' : 'ring-white/5'}`}>
      <div className="label">{title}{highlight && <span className="ml-2 rounded bg-gold-500/15 px-1.5 py-0.5 text-[10px] text-gold-300">usado na simulação</span>}</div>
      {ev ? (
        <>
          <div className="num mt-1 text-lg font-semibold">{fmtBRLPrecise(ev.amountPerShare)} <span className="text-xs font-normal text-mist-400">por cota</span></div>
          <div className="num mt-1 text-xs text-mist-300">Data-com: {d(ev.recordDate)} · Pagamento: {d(ev.paymentDate)}</div>
          <div className="mt-0.5 text-[11px] text-mist-400">
            {ev.referencePeriod && <>Referência: {ev.referencePeriod} · </>}
            {ev.taxExempt === true ? 'O fundo declara rendimento isento para PF que cumpra os requisitos legais' : ev.taxExempt === false ? <span className="text-loss-400">O aviso indica rendimento não isento</span> : 'Isenção não informada no aviso'}
          </div>
          <Src s={ev.source} url={ev.sourceUrl} />
        </>
      ) : <div className="mt-1 text-sm text-mist-500">Não disponível</div>}
    </div>
  );
}

export interface MarketPanelProps {
  status: MarketStatus | null;
  localSnapshot: MarketSnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onApply: (s: MarketSnapshot) => void;
  onSaveLocal: (s: MarketSnapshot) => void;
  isCustom: boolean;
  ticker: string;
}

export function MarketPanel({ status, localSnapshot, loading, error, onRefresh, onApply, onSaveLocal, isCustom, ticker }: MarketPanelProps) {
  const snap = status?.snapshot ?? localSnapshot;
  const [showForm, setShowForm] = useState(false);
  const used = snap ? defaultDividend(snap) : null;
  return (
    <section aria-label="Dados de mercado" data-testid="market-panel" className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-gold-400" aria-hidden />
          <h2 className="text-sm font-medium">Dados de mercado · {ticker}</h2>
          <span className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-mist-300">
            {status?.automaticUpdates ? `Fontes oficiais · atualização automática diária às 9h (Brasília), dias de pregão` : status ? 'Modo manual — sem atualização automática' : 'Serviço de dados indisponível — modo manual no navegador'}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setShowForm((v) => !v)}><PencilLine size={14} aria-hidden />Inserir manualmente</button>
          <button type="button" className="btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}Atualizar agora
          </button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-loss-500/10 p-3 text-xs text-loss-400 ring-1 ring-loss-500/30"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{error}</div>}
      {status?.lastError && <div role="alert" className="flex items-start gap-2 rounded-lg bg-loss-500/10 p-3 text-xs text-loss-400 ring-1 ring-loss-500/30"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />Última atualização falhou ({dt(status.lastAttemptAt)}): {status.lastError}. {status.snapshot ? 'Exibindo o último conjunto válido.' : ''}</div>}
      {snap && status?.stale !== false && <div data-testid="stale-warning" className="flex items-center gap-2 rounded-lg bg-gold-500/10 p-3 text-xs text-gold-300 ring-1 ring-gold-500/30"><Clock size={14} aria-hidden />Dados possivelmente desatualizados — confira a data da cotação e a fonte antes de usar.</div>}

      {snap ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-ink-850 p-3 ring-1 ring-white/5">
              <div className="label">{snap.lastTrade?.kind === 'fechamento' ? 'Último preço (fechamento oficial)' : 'Último preço negociado'}</div>
              {snap.lastTrade ? (
                <>
                  <div className="num mt-1 text-lg font-semibold">{fmtBRLPrecise(snap.lastTrade.price)}</div>
                  <div className="num mt-1 text-xs text-mist-300">
                    {snap.lastTrade.kind === 'fechamento' ? `Fechamento do pregão de ${d(snap.lastTrade.sessionDate ?? snap.lastTrade.tradedAt)}` : `Negócio: ${dt(snap.lastTrade.tradedAt)}`}
                  </div>
                  <Src s={snap.lastTrade.source} url={snap.lastTrade.sourceUrl} />
                </>
              ) : <div className="mt-1 text-sm text-mist-500">Não disponível</div>}
            </div>
            <DivBlock title="Último rendimento anunciado (a pagar)" ev={snap.lastAnnouncedDividend} highlight={used?.kind === 'anunciado'} />
            <DivBlock title={snap.lastPaidDividend?.estimated === 'cvm' ? 'Rendimento mensal ESTIMADO (CVM)' : snap.lastPaidDividend?.estimated === 'media12m' ? 'Média mensal de proventos (12 meses)' : 'Último rendimento pago'} ev={snap.lastPaidDividend} highlight={used?.kind === 'pago'} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist-400">
            <span>Provedor: {snap.provider}{snap.administrator ? ` · Administrador: ${snap.administrator}` : ''}{snap.paymentLagBusinessDays !== undefined ? ` · Prazo observado data-com→pagamento: ${snap.paymentLagBusinessDays} dias úteis` : ''} · Última consulta bem-sucedida: {dt(snap.fetchedAt)}{status?.nextScheduledRun ? ` · Próxima: ${dt(status.nextScheduledRun)}` : ''}</span>
            <button type="button" className="btn btn-gold" disabled={!snap.lastTrade || !used} onClick={() => onApply(snap)}>
              {isCustom ? 'Substituir cenário personalizado pelos dados de mercado' : 'Aplicar dados à simulação'}
            </button>
          </div>
          <p className="text-[11px] text-mist-500">A data da consulta não implica nova cotação: fora do pregão (noites, fins de semana e feriados) o preço permanece o do último negócio.</p>
        </>
      ) : (
        !loading && <p className="text-sm text-mist-400">{status?.automaticUpdates ? 'Nenhum dado de mercado disponível ainda. Clique em “Atualizar agora” para consultar a B3 e o Fundos.NET, ou informe os valores manualmente.' : 'Nenhum dado de mercado disponível no momento. Os campos abaixo mostram valores de EXEMPLO. Informe os valores manualmente a partir do aviso de rendimentos (Fundos.NET) e da cotação de fechamento (B3).'}</p>
      )}

      {showForm && <ManualForm ticker={ticker} onSave={(s) => { onSaveLocal(s); setShowForm(false); }} />}
    </section>
  );
}

function ManualForm({ onSave, ticker }: { onSave: (s: MarketSnapshot) => void; ticker: string }) {
  const [f, setF] = useState({ price: '', tradedAt: '', priceSource: '', dividend: '', dividendKind: 'anunciado' as 'anunciado' | 'pago', recordDate: '', paymentDate: '', dividendSource: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseBR(f.price);
    const dividend = parseBR(f.dividend);
    if (!price || Number(price) <= 0) return setErr('Preço inválido.');
    if (!dividend || Number(dividend) < 0) return setErr('Rendimento inválido.');
    if (!f.tradedAt || !f.recordDate || !f.paymentDate) return setErr('Informe as datas da cotação, data-com e pagamento.');
    if (!f.priceSource.trim() || !f.dividendSource.trim()) return setErr('Informe a fonte de cada informação.');
    setErr(null);
    onSave(manualSnapshot(ticker, { ...f, price, dividend, sessionDate: f.tradedAt.slice(0, 10), tradedAt: new Date(f.tradedAt).toISOString() }));
  };
  const lbl = 'flex flex-col gap-1 text-xs text-mist-400';
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg bg-ink-850 p-4 ring-1 ring-white/5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Inserir dados de mercado manualmente">
      <label className={lbl}>Último preço (R$)<input className="input" value={f.price} onChange={set('price')} inputMode="decimal" required /></label>
      <label className={lbl}>Data/hora do negócio<input className="input" type="datetime-local" value={f.tradedAt} onChange={set('tradedAt')} required /></label>
      <label className={`${lbl} lg:col-span-2`}>Fonte da cotação<input className="input" value={f.priceSource} onChange={set('priceSource')} placeholder="Ex.: B3 — boletim diário" required /></label>
      <label className={lbl}>Rendimento por cota (R$)<input className="input" value={f.dividend} onChange={set('dividend')} inputMode="decimal" required /></label>
      <label className={lbl}>Situação
        <select className="input" value={f.dividendKind} onChange={set('dividendKind')}>
          <option value="anunciado">Anunciado, ainda não pago</option>
          <option value="pago">Efetivamente pago</option>
        </select>
      </label>
      <label className={lbl}>Data-com<input className="input" type="date" value={f.recordDate} onChange={set('recordDate')} required /></label>
      <label className={lbl}>Data de pagamento<input className="input" type="date" value={f.paymentDate} onChange={set('paymentDate')} required /></label>
      <label className={`${lbl} sm:col-span-2 lg:col-span-3`}>Fonte do rendimento<input className="input" value={f.dividendSource} onChange={set('dividendSource')} placeholder="Ex.: Aviso aos cotistas — Fundos.NET" required /></label>
      <div className="flex items-end"><button className="btn btn-gold w-full" type="submit">Salvar dados manuais</button></div>
      {err && <p role="alert" className="text-xs text-loss-400 sm:col-span-2 lg:col-span-4">{err}</p>}
    </form>
  );
}
