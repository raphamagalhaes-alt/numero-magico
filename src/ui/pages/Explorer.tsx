import { useMemo, useState } from 'react';
import { ArrowDownUp, Calculator, GitCompare, Search } from 'lucide-react';
import { CLASS_LABEL, type AssetClassCode, type AssetMetrics } from '../../market/universe';
import { useUniverse } from '../data';
import { go } from '../route';
import { fmtCompactBRL, fmtDecimal, fmtPct } from '../format';
import { loadRaw, save } from '../storage';
import { InfoTip } from '../components/InfoTip';
import { AmountWords, NumInput } from '../components/NumInput';

type SortKey = 'ticker' | 'close' | 'chg12m' | 'avgVolume21' | 'vol12m' | 'dy12m' | 'dyAnnualizedLast' | 'pvp' | 'maxDrawdown12m';
const COLS: { key: SortKey; label: string; help: string; fii?: boolean }[] = [
  { key: 'close', label: 'Preço', help: 'Fechamento oficial do último pregão (B3 COTAHIST).' },
  { key: 'chg12m', label: 'Var. 12m', help: 'Variação do preço em cerca de 252 pregões. Não inclui rendimentos distribuídos.' },
  { key: 'avgVolume21', label: 'Liquidez/dia', help: 'Volume financeiro médio diário nos últimos 21 pregões com negócio.' },
  { key: 'vol12m', label: 'Volatilidade', help: 'Desvio-padrão anualizado dos retornos diários (12 meses). Maior = preço oscila mais.' },
  { key: 'maxDrawdown12m', label: 'Queda máx.', help: 'Maior queda do pico ao vale em 12 meses.' },
  { key: 'dy12m', label: 'DY 12m', help: 'Soma dos rendimentos com data-com nos últimos 12 meses ÷ preço atual (avisos oficiais do Fundos.NET). Só é exibido quando a central já tem 12 meses de avisos carregados.', fii: true },
  { key: 'dyAnnualizedLast', label: 'Últ. rend. ×12', help: 'Último rendimento anunciado/pago × 12 ÷ preço. Supõe repetição, o que não é garantido.', fii: true },
  { key: 'pvp', label: 'P/VP', help: 'Preço ÷ valor patrimonial por cota (informe mensal da CVM). Abaixo de 1 = negociado abaixo do patrimônio contábil.', fii: true },
];

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : fmtPct(v, d));
const COMPARE_KEY = 'mxrf:compare';
export const getCompareList = (): string[] => { const v = loadRaw<unknown>(COMPARE_KEY, []); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 4) : []; };

export function ExplorerPage() {
  const u = useUniverse();
  const [cls, setCls] = useState<AssetClassCode | 'ALL'>('FII');
  const [q, setQ] = useState('');
  const [minLiq, setMinLiq] = useState('100000');
  const [minDy, setMinDy] = useState('');
  const [maxPvp, setMaxPvp] = useState('');
  const [maxVol, setMaxVol] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'avgVolume21', dir: -1 });
  const [limit, setLimit] = useState(60);
  const [compare, setCompare] = useState<string[]>(getCompareList);

  const isFund = cls === 'FII' || cls === 'FIAGRO';
  const hasDiv = isFund || cls === 'ACAO';
  const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null; };

  const rows = useMemo(() => {
    const all = u.data?.assets ?? [];
    const qq = q.trim().toUpperCase();
    const liq = num(minLiq), dy = num(minDy), pvp = num(maxPvp), vol = num(maxVol);
    const f = all.filter((a) =>
      (cls === 'ALL' || a.cls === cls)
      && (!qq || a.ticker.includes(qq) || a.name.toUpperCase().includes(qq))
      && (liq === null || (a.avgVolume21 ?? 0) >= liq)
      && (dy === null || (a.dy12m ?? -1) >= dy / 100)
      && (pvp === null || (a.pvp !== null && a.pvp !== undefined && a.pvp <= pvp))
      && (vol === null || (a.vol12m !== null && a.vol12m <= vol / 100)));
    const k = sort.key;
    return f.sort((a, b) => {
      const va = k === 'ticker' ? a.ticker : (a[k] as number | null | undefined);
      const vb = k === 'ticker' ? b.ticker : (b[k] as number | null | undefined);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [u.data, cls, q, minLiq, minDy, maxPvp, maxVol, sort]);

  const toggleCompare = (t: string) => {
    const next = compare.includes(t) ? compare.filter((x) => x !== t) : compare.length >= 4 ? compare : [...compare, t];
    setCompare(next); save(COMPARE_KEY, next);
  };
  const counts = useMemo(() => {
    const c: Partial<Record<AssetClassCode, number>> = {};
    for (const a of u.data?.assets ?? []) c[a.cls] = (c[a.cls] ?? 0) + 1;
    return c;
  }, [u.data]);

  const head = (key: SortKey, label: string, help?: string) => (
    <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-ink-800 px-3 py-2.5 text-right font-medium text-mist-300" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <span className="inline-flex items-center gap-1">
        <button type="button" className="inline-flex items-center gap-1 hover:text-gold-300" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
          {label}<ArrowDownUp size={11} aria-hidden className={sort.key === key ? 'text-gold-400' : 'opacity-40'} />
        </button>
        {help && <InfoTip text={help} label={`Ajuda: ${label}`} />}
      </span>
    </th>
  );

  return (
    <section aria-labelledby="exp-title" className="flex flex-col gap-4">
      <div>
        <h1 id="exp-title" className="text-xl font-semibold">Explorar ativos</h1>
        <p className="text-sm text-mist-400">Todos os ativos negociados na B3 no último pregão, com indicadores calculados a partir de dados oficiais. Filtros objetivos para estudo — não é recomendação de compra ou venda.</p>
      </div>
      {u.loading && <p className="card p-4 text-sm text-mist-400" role="status">Carregando o universo de ativos…</p>}
      {u.error && <p className="card p-4 text-sm text-loss-400" role="alert">{u.error}</p>}
      {u.data && u.data.assets.length === 0 && <NoQuotesGuide />}
      {u.data && u.data.assets.length > 0 && (
        <>
          <p className="text-xs text-mist-500" data-testid="universe-meta">
            {u.data.assets.length} ativos · último pregão {u.data.asOf?.split('-').reverse().join('/')} · histórico desde {u.data.historyFrom?.split('-').reverse().join('/')} ({u.data.sessions} pregões)
            {u.data.dividendsCoverageFrom && ` · rendimentos de FII desde ${u.data.dividendsCoverageFrom.split('-').reverse().join('/')}`}
            {u.data.dividendsCoverageFrom && u.data.dividendsCoverageFrom > new Date(Date.now() - 335 * 86400000).toISOString().slice(0, 10) && ' (DY 12m aparece quando a cobertura completar 12 meses)'}
          </p>
          <div className="seg flex-wrap" role="group" aria-label="Classe de ativo">
            {(['FII', 'ACAO', 'ETF', 'BDR', 'FIAGRO', 'FUNDO', 'ALL'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cls === c} onClick={() => { setCls(c); setLimit(60); }}>
                {c === 'ALL' ? 'Todos' : CLASS_LABEL[c]} <span className="text-mist-500">{c === 'ALL' ? u.data!.assets.length : counts[c] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-mist-400 md:col-span-1 xl:col-span-2">Buscar ticker ou nome
              <span className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" aria-hidden />
                <input data-testid="exp-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: MXRF, PETR, logística" /></span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Liquidez mín. (R$/dia)<NumInput className="input num" inputMode="numeric" value={minLiq} onChange={(e) => setMinLiq(e.target.value)} /><AmountWords value={minLiq} /></label>
            <label className="flex flex-col gap-1 text-xs text-mist-400">Volatilidade máx. (%)<NumInput className="input num" inputMode="decimal" value={maxVol} onChange={(e) => setMaxVol(e.target.value)} /></label>
            {hasDiv && <label className="flex flex-col gap-1 text-xs text-mist-400">DY 12m mín. (%)<input data-testid="exp-mindy" className="input num" inputMode="decimal" value={minDy} onChange={(e) => setMinDy(e.target.value)} /></label>}
            {isFund && <label className="flex flex-col gap-1 text-xs text-mist-400">P/VP máx.<NumInput className="input num" inputMode="decimal" value={maxPvp} onChange={(e) => setMaxPvp(e.target.value)} /></label>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist-400">
            <span data-testid="exp-count">{rows.length} resultados</span>
            <button type="button" className="btn" disabled={compare.length < 2} onClick={() => go('comparar', { t: compare.join(',') })}>
              <GitCompare size={14} aria-hidden />Comparar selecionados ({compare.length}/4)
            </button>
          </div>
          <div className="card max-h-[70vh] overflow-auto" tabIndex={0} aria-label="Tabela de ativos">
            <table className="num w-full border-separate border-spacing-0 text-xs" data-testid="exp-table">
              <thead><tr>
                <th scope="col" className="sticky left-0 top-0 z-20 bg-ink-800 px-3 py-2.5 text-left font-medium text-mist-300">
                  <button type="button" className="hover:text-gold-300" onClick={() => setSort((s) => ({ key: 'ticker', dir: s.key === 'ticker' ? (s.dir === 1 ? -1 : 1) : 1 }))}>Ativo</button>
                </th>
                {COLS.filter((c) => !c.fii || hasDiv || cls === 'ALL').filter((c) => !(cls === 'ACAO' && (c.key === 'pvp' || c.key === 'dyAnnualizedLast'))).map((c) => head(c.key, c.label, c.help))}
                <th scope="col" className="sticky top-0 z-10 bg-ink-800 px-3 py-2.5 text-right font-medium text-mist-300">Ações</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map((a: AssetMetrics) => (
                  <tr key={a.ticker} data-ticker={a.ticker} className="odd:bg-ink-900 even:bg-ink-850">
                    <th scope="row" className="sticky left-0 z-[5] bg-inherit px-3 py-2 text-left font-medium">
                      <span className="text-mist-100">{a.ticker}</span>
                      <span className="block max-w-[180px] truncate text-[11px] font-normal text-mist-500">{a.name}{a.segment ? ` · ${a.segment}` : ''}</span>
                    </th>
                    {COLS.filter((c) => !c.fii || hasDiv || cls === 'ALL').filter((c) => !(cls === 'ACAO' && (c.key === 'pvp' || c.key === 'dyAnnualizedLast'))).map((c) => (
                      <td key={c.key} className={`whitespace-nowrap px-3 py-2 text-right ${(c.key === 'chg12m' || c.key === 'maxDrawdown12m') && (a[c.key] ?? 0) < 0 ? 'text-loss-400' : c.key === 'chg12m' && (a.chg12m ?? 0) > 0 ? 'text-gain-400' : 'text-mist-200'}`}>
                        {c.key === 'close' ? `R$ ${fmtDecimal(a.close, 2)}`
                          : c.key === 'avgVolume21' ? (a.avgVolume21 === null ? '—' : fmtCompactBRL(a.avgVolume21).replace(/^(?!R\$)/, 'R$ '))
                          : c.key === 'pvp' ? (a.pvpInconsistent ? <span title="VP/cota informado à CVM incompatível com a cota negociada (provável desdobramento ou grupamento recente)">n/d*</span> : a.pvp === null || a.pvp === undefined ? '—' : fmtDecimal(a.pvp, 2))
                          : pct(a[c.key] as number | null | undefined)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {(((a.cls === 'FII' || a.cls === 'FIAGRO') && a.cnpj) || (a.cls === 'ACAO' && a.dy12m)) && (
                        <button type="button" className="btn !px-2 !py-1 text-[11px]" onClick={() => go('simulador', { t: a.ticker })} aria-label={`Simular ${a.ticker}`}><Calculator size={12} aria-hidden />Simular</button>
                      )}{' '}
                      <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-mist-400">
                        <input type="checkbox" className="accent-[#c9a24a]" checked={compare.includes(a.ticker)} disabled={!compare.includes(a.ticker) && compare.length >= 4} onChange={() => toggleCompare(a.ticker)} aria-label={`Comparar ${a.ticker}`} />Comparar
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && <button type="button" className="btn self-center" onClick={() => setLimit((l) => l + 120)}>Mostrar mais ({rows.length - limit} restantes)</button>}
          <p className="text-[11px] text-mist-500">
            DY de ações: dividendos + JCP (bruto, antes do IR retido no JCP) com data-com nos últimos 12 meses, por classe de ação (B3 — Empresas Listadas). FIIs/Fiagros: avisos do Fundos.NET. ETFs e BDRs: só preço. n/d* = valor patrimonial da CVM incompatível com a cota negociada (por exemplo, desdobramento recente ainda não refletido no informe mensal). Rentabilidade passada não garante resultados futuros.
          </p>
        </>
      )}
    </section>
  );
}

/** Mostrado enquanto este aparelho ainda não tem cotações: diz exatamente o que fazer. */
export function NoQuotesGuide() {
  return (
    <div className="card flex flex-col gap-3 p-5 ring-gold-500/30" data-testid="no-quotes">
      <h2 className="text-base font-semibold">Ainda não há preços neste aparelho</h2>
      <p className="text-sm text-mist-300">Para ver ações, fundos e ETFs com preço atualizado, faça <b>uma vez</b> a configuração das cotações. Leva cerca de 2 minutos e é gratuito.</p>
      <ol className="list-decimal pl-5 text-sm text-mist-300">
        <li>Toque em <b>Configurar cotações</b>.</li>
        <li>Siga os passos da tela (criar uma chave gratuita ou enviar o arquivo da B3).</li>
        <li>Volte aqui: a lista aparece sozinha.</li>
      </ol>
      <button type="button" className="btn btn-gold self-start" onClick={() => go('dados')} data-testid="go-quotes">Configurar cotações</button>
      <p className="text-xs text-mist-500">Enquanto isso, o <button type="button" className="underline" onClick={() => go('simulador')}>Simular</button> e a <button type="button" className="underline" onClick={() => go('juros')}>Renda fixa</button> já funcionam sem configurar nada.</p>
    </div>
  );
}
