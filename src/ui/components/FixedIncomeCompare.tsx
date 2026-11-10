import { useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { compareFixedIncome, dec, ipcaPlusNominal, type SimulationResult } from '../../engine';
import { useMacro } from '../data';
import { fmtBRL, fmtDecimal } from '../format';
import { parseBR } from '../form';
import { InfoTip } from './InfoTip';
import { NumInput } from './NumInput';

const longest = (bonds: { type: string; maturity: string; buyRate: number | null }[], type: string) =>
  bonds.filter((b) => b.type === type && b.buyRate !== null).sort((a, b) => b.maturity.localeCompare(a.maturity))[0];

/** Mesmo dinheiro, mesmas datas: FII (líquido se vendido) × alternativas de renda fixa com taxas oficiais de hoje. */
export function FixedIncomeCompare({ result }: { result: SimulationResult }) {
  const m = useMacro();
  const cdiNow = m.data?.indicators.find((i) => i.key === 'cdi')?.last?.value ?? null;
  const selicNow = m.data?.indicators.find((i) => i.key === 'selic_meta')?.last?.value ?? null;
  const bonds = m.data?.tesouro.bonds ?? [];
  const ipca = longest(bonds, 'Tesouro IPCA+');
  const pre = longest(bonds, 'Tesouro Prefixado');
  const [cdi, setCdi] = useState<string>('');
  const [pctCdb, setPctCdb] = useState('100');
  const [pctLci, setPctLci] = useState('90');
  const cdiRate = (parseBR(cdi) ? Number(parseBR(cdi)) : cdiNow ?? 0) / 100;
  const infl = dec(result.input.inflationAnnual);

  const rows = useMemo(() => {
    if (!cdiRate) return [];
    const list = [
      { label: `CDB ${pctCdb}% do CDI`, annualRate: String(cdiRate * (Number(parseBR(pctCdb) ?? 100) / 100)), regressiveTax: true, note: 'IR regressivo' },
      { label: `LCI/LCA ${pctLci}% do CDI`, annualRate: String(cdiRate * (Number(parseBR(pctLci) ?? 90) / 100)), regressiveTax: false, note: 'isenta de IR para PF' },
      ...(selicNow ? [{ label: 'Tesouro Selic', annualRate: String(selicNow / 100), custodyAnnual: '0.002', regressiveTax: true, note: 'Selic atual + custódia B3 0,20% a.a.' }] : []),
      ...(pre?.buyRate ? [{ label: `Tesouro Prefixado ${pre.maturity.slice(0, 4)}`, annualRate: String(pre.buyRate / 100), custodyAnnual: '0.002', regressiveTax: true, note: `${fmtDecimal(pre.buyRate, 2)}% a.a. reinvestido à mesma taxa` }] : []),
      ...(ipca?.buyRate ? [{ label: `Tesouro IPCA+ ${ipca.maturity.slice(0, 4)}`, annualRate: ipcaPlusNominal(ipca.buyRate / 100, infl).toFixed(), custodyAnnual: '0.002', regressiveTax: true, note: `IPCA+${fmtDecimal(ipca.buyRate, 2)}% com a inflação da simulação` }] : []),
    ];
    return list.map((x) => ({ ...compareFixedIncome(result, x), note: x.note, rate: Number(x.annualRate) }));
  }, [result, cdiRate, pctCdb, pctLci, selicNow, pre, ipca, infl]);

  const fii = result.summary;
  const all = [{ label: `${result.input.reinvestRatio === '1' ? 'FII com reinvestimento' : 'FII'} (líquido se vendido)`, net: fii.finalNetLiquidationEquity, netReal: fii.finalNetLiquidationEquity.div(result.rows[result.rows.length - 1].deflator), note: `Rendimento ${fmtDecimal(dec(result.input.dividend).mul(12).div(result.input.price).mul(100), 2)}% a.a. e preço da cota constantes, sem correção pela inflação (premissas da aba)`, rate: null as number | null }, ...rows];
  const best = all.reduce((a, b) => (b.net.gt(a.net) ? b : a), all[0]);

  return (
    <section aria-labelledby="fi-title" className="flex flex-col gap-3" data-testid="fixed-income">
      <h2 id="fi-title" className="flex items-center gap-2 text-lg font-semibold"><Landmark size={18} className="text-gold-400" aria-hidden />Comparar com renda fixa
        <InfoTip text="Aplica exatamente o mesmo dinheiro nas mesmas datas (investimento inicial e aportes) em cada alternativa, com taxa constante por 30 anos, IR regressivo por aporte e custódia do Tesouro. Taxas de hoje: Banco Central (CDI/Selic) e Tesouro Direto (títulos mais longos de cada tipo). Taxas futuras vão mudar." /></h2>
      {m.error && <p className="text-xs text-loss-400">Taxas oficiais indisponíveis ({m.error}). Informe o CDI manualmente.</p>}
      <div className="card grid grid-cols-3 gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs text-mist-400">CDI (% a.a.){cdiNow !== null && <span className="text-[11px] text-mist-500">oficial: {fmtDecimal(cdiNow, 2)}%</span>}<NumInput className="input num" placeholder={cdiNow !== null ? fmtDecimal(cdiNow, 2) : ''} value={cdi} onChange={(e) => setCdi(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-mist-400">CDB (% do CDI)<span className="text-[11px] text-mist-500">&nbsp;</span><NumInput className="input num" value={pctCdb} onChange={(e) => setPctCdb(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-mist-400">LCI/LCA (% do CDI)<span className="text-[11px] text-mist-500">&nbsp;</span><NumInput className="input num" value={pctLci} onChange={(e) => setPctLci(e.target.value)} /></label>
      </div>
      <div className="card overflow-x-auto">
        <table className="num w-full text-xs">
          <thead><tr className="bg-ink-800 text-mist-300">{['Alternativa', 'Premissa', 'Investido', 'IR', 'Líquido no mês 360', 'Líquido em R$ de hoje'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.label} className={`border-t border-white/5 ${r === best ? 'bg-ink-850' : ''}`}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-mist-200">{r.label}</th>
                <td className="px-3 py-2 text-mist-400">{r.note}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(fii.totalInvested)}</td>
                <td className="px-3 py-2 text-right">{'tax' in r ? fmtBRL((r as { tax: typeof fii.totalFees }).tax) : fmtBRL(fii.finalLiquidationCosts)}</td>
                <td className="px-3 py-2 text-right text-mist-100">{fmtBRL(r.net)}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(r.netReal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-mist-500">Maior valor líquido nesta comparação hipotética: <strong className="text-mist-300">{best.label}</strong>. Riscos são diferentes: FIIs têm renda e preço variáveis; títulos públicos têm risco soberano e marcação a mercado; CDB/LCI têm risco do emissor (FGC até o limite legal). Não é recomendação.</p>
    </section>
  );
}
