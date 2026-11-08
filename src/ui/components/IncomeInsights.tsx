import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Scale } from 'lucide-react';
import { fixedIncomeTest, projectIncomeCalendar, type PayEvent } from '../../engine/income-calendar';
import type { AssetDetail } from '../../market/universe';
import { fetchCached, useMacro } from '../data';
import { fmtBRL, fmtPct } from '../format';

const brl = (v: number) => fmtBRL(v.toFixed(2));
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
const todaySP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Calendário de renda: quanto deve cair em cada um dos próximos 12 meses. */
export function IncomeCalendar({ positions }: { positions: { ticker: string; shares: number }[] }) {
  const [events, setEvents] = useState<PayEvent[] | null>(null);
  const key = positions.map((p) => p.ticker).join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(positions.map((p) => fetchCached<AssetDetail>(`/api/asset/${p.ticker}`).then((d) => d.dividends.map((x) => ({ ticker: p.ticker, amount: x.amount, paymentDate: x.paymentDate || x.recordDate }))).catch(() => [] as PayEvent[])))
      .then((all) => alive && setEvents(all.flat()));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const shares = useMemo(() => Object.fromEntries(positions.map((p) => [p.ticker, p.shares])), [positions]);
  if (!positions.length) return null;
  const cal = events ? projectIncomeCalendar(events, shares, todaySP()) : null;
  const max = cal ? Math.max(1, ...cal.months.map((m) => m.total)) : 1;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="cal-title" data-testid="income-calendar">
      <div>
        <h2 id="cal-title" className="flex items-center gap-2 text-base font-semibold"><CalendarDays size={16} className="text-gold-400" aria-hidden />Calendário de renda — próximos 12 meses</h2>
        <p className="text-xs text-mist-400">Quanto deve cair na sua conta em cada mês. Rendimentos já anunciados aparecem em dourado; os outros repetem o que cada ativo pagou no mesmo mês do último ano.</p>
      </div>
      {!cal && <p className="text-xs text-mist-500" role="status">Calculando…</p>}
      {cal && cal.total === 0 && <p className="text-xs text-mist-500">Ainda não há histórico de rendimentos dos seus ativos neste aparelho.</p>}
      {cal && cal.total > 0 && (
        <>
          <div className="grid grid-cols-12 items-end gap-1" style={{ height: 140 }} role="img" aria-label={`Renda prevista: média de ${brl(cal.avg)} por mês; mês mais fraco ${monthName(cal.weakest!.ym)}, mais forte ${monthName(cal.strongest!.ym)}.`}>
            {cal.months.map((m) => {
              const conf = m.items.some((i) => i.confirmed);
              return (
                <div key={m.ym} className="flex h-full flex-col items-center justify-end gap-1" title={`${monthName(m.ym)}: ${brl(m.total)}`} data-ym={m.ym}>
                  <span className="num text-[9px] text-mist-400">{m.total >= 1000 ? `${(m.total / 1000).toFixed(1).replace('.', ',')}k` : Math.round(m.total)}</span>
                  <div className={`w-full rounded-t ${m === cal.weakest ? 'bg-loss-500/70' : conf ? 'bg-gold-400' : 'bg-gold-600/60'}`} style={{ height: `${Math.max(2, (m.total / max) * 100)}%` }} />
                  <span className="text-[9px] text-mist-500">{monthName(m.ym).split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <p className="rounded-lg bg-ink-850 p-2.5">Total em 12 meses<br /><b className="num text-sm">{brl(cal.total)}</b></p>
            <p className="rounded-lg bg-ink-850 p-2.5">Média por mês<br /><b className="num text-sm">{brl(cal.avg)}</b></p>
            <p className="rounded-lg bg-ink-850 p-2.5" data-testid="cal-weakest">Mês mais fraco: <b>{monthName(cal.weakest!.ym)}</b> ({brl(cal.weakest!.total)})<br /><span className="text-mist-500">Mais forte: {monthName(cal.strongest!.ym)} ({brl(cal.strongest!.total)})</span></p>
          </div>
          {cal.weakest!.total < cal.avg * 0.6 && <p className="text-[11px] text-mist-400">Dica: se você depende dessa renda todo mês, guarde parte dos meses fortes para cobrir os fracos.</p>}
        </>
      )}
      <p className="text-[11px] text-mist-500">Projeção baseada em pagamentos passados; empresas e fundos podem mudar, reduzir ou suspender rendimentos.</p>
    </section>
  );
}

/** Teste da renda fixa: a carteira paga mais que o investimento sem risco? */
export function FixedIncomeCheck({ income, value }: { income: number; value: number }) {
  const macro = useMacro();
  const ind = (k: string) => macro.data?.indicators.find((i) => i.key === k)?.last?.value ?? null;
  const ipcaPlus = (macro.data?.tesouro.bonds ?? []).filter((b) => /IPCA\+/.test(b.type) && !/Semestrais|Renda|Educa/i.test(b.type) && b.buyRate).sort((a, b) => b.maturity.localeCompare(a.maturity))[0];
  const real = ipcaPlus?.buyRate ? (ipcaPlus.buyRate > 1 ? ipcaPlus.buyRate : ipcaPlus.buyRate * 100) : null;
  const t = fixedIncomeTest({ income, value, selicPct: ind('selic_meta'), ipca12mPct: ind('ipca_12m'), ipcaPlusRealPct: real });
  if (!value) return null;
  const above = t.diff !== null && t.diff >= 0;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="fit-title" data-testid="fixed-income-test">
      <h2 id="fit-title" className="flex items-center gap-2 text-base font-semibold"><Scale size={16} className="text-gold-400" aria-hidden />Teste da renda fixa</h2>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <p className="rounded-lg bg-ink-850 p-3">Sua carteira paga em rendimentos<br /><b className="num text-lg text-mist-100">{t.portfolioYield === null ? '—' : `${fmtPct(t.portfolioYield, 1)} ao ano`}</b><br /><span className="text-mist-500">({brl(income)}/mês sobre {brl(value)})</span></p>
        <p className="rounded-lg bg-ink-850 p-3">Tesouro Selic, sem risco<br /><b className="num text-lg text-mist-100">{t.selicNet === null ? '—' : `${fmtPct(t.selicNet, 1)} ao ano`}</b><br /><span className="text-mist-500">líquido de IR (15%), Selic {ind('selic_meta') === null ? '—' : fmtPct(ind('selic_meta')! / 100, 2)}</span></p>
        <p className="rounded-lg bg-ink-850 p-3">Tesouro IPCA+, sem risco de calote<br /><b className="num text-lg text-mist-100">{t.ipcaPlusNet === null ? '—' : `≈ ${fmtPct(t.ipcaPlusNet, 1)} ao ano`}</b><br /><span className="text-mist-500">{real === null ? '' : `IPCA + ${fmtPct(real / 100, 2)}, líquido de IR`}</span></p>
      </div>
      {t.diff !== null && (
        <p className={`text-sm ${above ? 'text-gain-400' : 'text-gold-300'}`} data-testid="fit-verdict">
          {above
            ? <>Sua carteira paga <b>{fmtPct(t.diff, 1)}</b> ao ano a mais em rendimentos do que o Tesouro Selic líquido.</>
            : <>Sua carteira paga <b>{fmtPct(-t.diff, 1)}</b> ao ano a menos em rendimentos do que o Tesouro Selic líquido, que não tem risco de bolsa.</>}
        </p>
      )}
      <p className="text-[11px] text-mist-500">Para valer o risco, renda variável precisa compensar com rendimentos e/ou valorização ao longo do tempo — e o que importa é o conjunto, não só um ano. Rendimentos de FIIs e dividendos são, em regra, isentos de IR para pessoa física (há exceções e regras novas para valores altos); confirme as regras vigentes. Comparação educativa, não é recomendação.</p>
    </section>
  );
}
