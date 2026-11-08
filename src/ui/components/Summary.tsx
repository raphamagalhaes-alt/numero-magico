import { Target } from 'lucide-react';
import type { SimulationResult } from '../../engine';
import { fmtBRL, fmtInt, fmtPct, yearsMonthsLabel } from '../format';
import { Stat } from './Stat';

export function GoalBanner({ result }: { result: SimulationResult }) {
  const { goalMonth, goalProgress } = result.summary;
  const basis = result.input.incomeGoalBasis === 'real' ? 'real (poder de compra de hoje)' : 'nominal';
  const goal = fmtBRL(result.input.incomeGoal);
  return (
    <div data-testid="goal-banner" className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${goalMonth ? 'ring-gain-500/30' : 'ring-loss-500/30'}`}>
      <Target size={20} className={goalMonth ? 'text-gain-400' : 'text-loss-400'} aria-hidden />
      <div className="flex-1">
        {goalMonth ? (
          <p className="font-medium text-gain-400">Meta atingida no mês {goalMonth} — {yearsMonthsLabel(goalMonth)} de simulação.{result.rows[goalMonth - 1].paymentDate ? ` Pagamento previsto: ${result.rows[goalMonth - 1].paymentDate!.split('-').reverse().join('/')}.` : ''}</p>
        ) : (
          <p className="font-medium text-loss-400">Meta não atingida em 360 meses.</p>
        )}
        <p className="text-xs text-mist-400">Meta de renda {basis}: {goal}/mês. Considera a renda líquida das cotas detidas na data-com, antes do reinvestimento.</p>
      </div>
      <div className="w-full sm:w-56">
        <div className="flex justify-between text-xs text-mist-400"><span>Progresso</span><span className="num">{fmtPct(goalProgress, 1)}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goalProgress.toNumber() * 100)} aria-label="Progresso da meta de renda">
          <div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gain-400" style={{ width: `${goalProgress.mul(100).toNumber()}%` }} />
        </div>
      </div>
    </div>
  );
}

export function ExecutiveSummary({ result, showReal, showContrib }: { result: SimulationResult; showReal: boolean; showContrib: boolean }) {
  const s = result.summary;
  const growthTone = s.growthOverInvested.gte(0) ? 'gain' : 'loss';
  return (
    <section aria-label="Resumo executivo" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat label="Investimento inicial" value={fmtBRL(s.initialInvestment)} help="Cotas iniciais × preço da cota no mês 0." />
      <Stat label="Cotas iniciais" value={fmtInt(s.initialShares)} />
      <Stat label="Cotas finais" value={fmtInt(s.finalShares)} tone="gold" testId="final-shares" help="Quantidade de cotas no encerramento do mês 360." />
      <Stat label="Renda no mês 360" value={fmtBRL(s.finalIncome)} tone="gold" help="Rendimento recebido pelas cotas existentes no início do mês 360." sub={showReal ? `Real: ${fmtBRL(s.finalRealIncome)}` : undefined} />
      <Stat label="Patrimônio no mês 360" value={fmtBRL(s.finalEquity)} testId="final-equity" help="Valor de mercado das cotas + saldo residual em caixa." sub={`Caixa residual: ${fmtBRL(s.finalCash)}`} />
      {showContrib && <Stat label="Total aportado" value={fmtBRL(s.totalContributions)} help="Soma dos aportes mensais (sem o investimento inicial)." sub={`Capital total: ${fmtBRL(s.totalInvested)}`} />}
      {showReal && <Stat label="Patrimônio real" value={fmtBRL(s.finalRealEquity)} help="Patrimônio do mês 360 em poder de compra do mês 0: nominal / (1 + inflação)^(t/12)." sub={<span className="text-loss-400">Perda de poder de compra: {fmtBRL(s.purchasingPowerLoss)}</span>} />}
      <Stat label="Crescimento patrimonial" value={fmtBRL(s.growthOverInvested)} tone={growthTone} help="Patrimônio final menos todo o capital aportado (inicial + aportes)." sub={`${fmtPct(s.growthPct, 1)} sobre o capital aportado`} />
      <Stat label="Dividendos recebidos" value={fmtBRL(s.totalIncome)} help="Soma de todos os rendimentos recebidos em 360 meses." sub={`Reinvestidos: ${fmtBRL(s.totalReinvested)}`} />
      <Stat label="Líquido se vendido no mês 360" value={fmtBRL(s.finalNetLiquidationEquity)} testId="net-liquidation"
        help="Patrimônio total menos custos de venda e IR sobre ganho de capital (alíquota das premissas avançadas), se todas as cotas fossem vendidas ao preço do mês 360."
        sub={`IR + custos na venda: ${fmtBRL(s.finalLiquidationCosts)}`} />
      {(s.totalFees.gt(0) || s.totalDividendTax.gt(0) || s.totalCashInterest.gt(0)) && (
        <Stat label="Custos, IR e juros do caixa" value={fmtBRL(s.totalFees.add(s.totalDividendTax))}
          help="Custos de negociação pagos nas compras + IR retido sobre rendimentos, em 360 meses. Juros do caixa somam ao disponível."
          sub={`Custos ${fmtBRL(s.totalFees)} · IR ${fmtBRL(s.totalDividendTax)} · Juros ${fmtBRL(s.totalCashInterest)}`} />
      )}
      <Stat label="Meta de renda" value={s.goalMonth ? `Mês ${s.goalMonth}` : 'Não atingida'} tone={s.goalMonth ? 'gain' : 'loss'} sub={`${fmtPct(s.goalProgress, 1)} da meta`} />
    </section>
  );
}
