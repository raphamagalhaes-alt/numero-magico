import { Sparkles, Wallet } from 'lucide-react';
import type { MagicNumberResult } from '../../engine';
import { fmtBRL, fmtInt } from '../format';

export function MagicCards({ magic, desired }: { magic: MagicNumberResult | null; desired: number }) {
  if (!magic) return null;
  if (!magic.finite) {
    return (
      <section aria-label="Número mágico" className="card border-l-2 border-loss-500 p-5">
        <p className="font-medium text-loss-400">Não existe número mágico finito neste cenário.</p>
        <p className="mt-1 text-sm text-mist-400">Com dividendo igual a zero, nenhuma quantidade de cotas gera rendimento para comprar novas cotas.</p>
      </section>
    );
  }
  return (
    <section aria-label="Número mágico" className="grid gap-4 md:grid-cols-2">
      <div className="card relative overflow-hidden p-6">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gold-500/10 blur-2xl" aria-hidden />
        <div className="label flex items-center gap-2"><Sparkles size={14} className="text-gold-400" aria-hidden />Número mágico</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span data-testid="magic-shares" className="num text-5xl font-semibold text-gold-300">{fmtInt(magic.shares)}</span>
          <span className="text-mist-400">cotas</span>
        </div>
        <p className="mt-2 text-xs text-mist-400">
          Rende {fmtBRL(magic.firstIncome)} no 1º mês — paga {desired} {desired === 1 ? 'cota' : 'cotas'} ({fmtBRL(magic.targetCost)}).
          {magic.quantizationAdjusted && <> Ajustado de {fmtInt(magic.theoreticalShares)} para {fmtInt(magic.shares)} pela quantização do rendimento em centavos.</>}
        </p>
      </div>
      <div className="card relative overflow-hidden p-6">
        <div className="label flex items-center gap-2"><Wallet size={14} className="text-gold-400" aria-hidden />Investimento inicial necessário</div>
        <div data-testid="magic-investment" className="num mt-2 text-5xl font-semibold text-mist-100">{fmtBRL(magic.initialInvestment)}</div>
        <p className="mt-2 text-xs text-mist-400">{fmtInt(magic.shares)} cotas × preço da cota{magic.initialFees.gt(0) ? ` + ${fmtBRL(magic.initialFees)} de custos` : ''}.</p>
      </div>
      <p className="text-sm text-mist-400 md:col-span-2">
        Este número representa o capital inicial estimado para comprar determinada quantidade de cotas com o rendimento de um mês, considerando preço e dividendo constantes.
      </p>
    </section>
  );
}
