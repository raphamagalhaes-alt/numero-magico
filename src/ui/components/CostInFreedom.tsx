import { useState } from 'react';
import { Hourglass, Share2 } from 'lucide-react';
import { daysLabel, freedomDelayDays } from '../../engine/freedom';
import { fmtBRL } from '../format';
import { go } from '../route';
import { num, useFreedomPlan } from '../freedom-plan';
import { AmountWords, NumInput } from './NumInput';

/** "Quanto isso custa em liberdade?": traduz um gasto em dias a mais até a liberdade financeira. */
export function CostInFreedom({ compact = false }: { compact?: boolean }) {
  const plan = useFreedomPlan();
  const [value, setValue] = useState('');
  const [monthly, setMonthly] = useState(false);
  const v = num(value);
  const p = { capital: plan.capital, contribution: plan.contribution, target: plan.target, rate: plan.rate };
  const days = v > 0 ? freedomDelayDays(p, monthly ? { monthly: v } : { oneOff: v }) : null;
  const billsDays = plan.cov.total > 0 && v > 0 ? Math.round(v / (plan.cov.total / 30)) : null;
  const incomeForever = v > 0 && !monthly ? Math.round((v * plan.rate / 12) * 100) / 100 : null;
  const brl = (x: number) => fmtBRL(x.toFixed(2));
  const shareText = days !== null && days > 0
    ? `${monthly ? 'Um gasto de' : 'Comprar algo de'} ${brl(v)}${monthly ? ' por mês' : ''} atrasaria minha liberdade financeira em ${daysLabel(days)}. Calculei no Número Mágico.`
    : '';
  return (
    <section className={`card flex flex-col gap-3 ${compact ? 'p-4' : 'p-5'} ring-gold-500/30`} aria-labelledby="cost-title" data-testid="cost-freedom">
      <div>
        <h2 id="cost-title" className="flex items-center gap-2 text-base font-semibold"><Hourglass size={16} className="text-gold-400" aria-hidden />Quanto isso custa em liberdade?</h2>
        <p className="text-xs text-mist-400">Antes de comprar, veja o preço na moeda que importa: o tempo até seus investimentos pagarem todas as suas contas.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-mist-400">Valor (R$)<NumInput className="input num text-lg" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: 3.000" data-testid="cost-value" /><AmountWords value={value} /></label>
        <div className="seg" role="group" aria-label="Tipo de gasto">
          <button type="button" aria-pressed={!monthly} onClick={() => setMonthly(false)}>Uma vez</button>
          <button type="button" aria-pressed={monthly} onClick={() => setMonthly(true)} data-testid="cost-monthly">Todo mês</button>
        </div>
      </div>
      {v > 0 && days !== null && (
        <div className="rounded-lg bg-ink-850 p-4" data-testid="cost-result">
          <p className="text-sm text-mist-300">{monthly ? 'Esse gasto mensal' : 'Esse gasto'} atrasa sua liberdade em</p>
          <p className="num text-3xl font-semibold text-gold-300">{daysLabel(days)}</p>
          {incomeForever !== null && <p className="mt-1 text-xs text-mist-400">Se investido, renderia cerca de <b>{brl(incomeForever)} por mês</b> para sempre (acima da inflação).</p>}
          {billsDays !== null && !monthly && <p className="text-xs text-mist-500">É o mesmo que {billsDays} dia{billsDays === 1 ? '' : 's'} de todas as contas da sua casa.</p>}
          {shareText && 'share' in navigator && <button type="button" className="btn mt-2 !py-1 text-xs" onClick={() => navigator.share({ text: shareText }).catch(() => undefined)}><Share2 size={12} aria-hidden />Compartilhar</button>}
        </div>
      )}
      {v > 0 && days === null && (
        <p className="text-xs text-mist-400" data-testid="cost-fallback">{billsDays !== null ? <>Isso equivale a <b>{billsDays} dias</b> de todas as contas da sua casa. </> : null}Para ver em dias de liberdade, preencha suas contas e quanto investe por mês na <button type="button" className="underline" onClick={() => go('liberdade')}>Liberdade</button>.</p>
      )}
      <p className="text-[11px] text-mist-500">Calculado com o seu plano (contas da casa, patrimônio, aporte de {brl(plan.contribution)}/mês e {(plan.rate * 100).toFixed(1).replace('.', ',')}% ao ano acima da inflação). Não é para culpar ninguém: é para decidir sabendo o preço.</p>
    </section>
  );
}
