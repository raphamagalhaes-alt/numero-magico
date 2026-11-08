import { useMemo } from 'react';
import { Repeat } from 'lucide-react';
import { compareStrategies, type SimulationInput } from '../../engine';
import { fmtBRL, fmtInt } from '../format';

export function StrategyCompare({ base }: { base: SimulationInput | null }) {
  const out = useMemo(() => (base ? compareStrategies(base) : []), [base]);
  if (!out.length) return null;
  return (
    <section id="estrategias" aria-label="Comparação de estratégias" className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Repeat size={18} className="text-gold-400" aria-hidden /><h2 className="text-lg font-semibold">Comparação de estratégias de reinvestimento</h2></div>
      <p className="text-xs text-mist-400">
        Mesmas premissas da aba selecionada. Dividendos retirados vão para o bolso do investidor e são registrados à parte — não entram no patrimônio investido, evitando dupla contagem.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {out.map((o) => (
          <div key={o.id} data-testid={`strategy-${o.id}`} className="card p-4">
            <div className="text-sm font-medium text-mist-100">{o.label}</div>
            <dl className="num mt-3 grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-mist-400">Patrimônio investido final</dt><dd className="text-right text-mist-100">{fmtBRL(o.finalEquity)}</dd>
              <dt className="text-mist-400">Recebido em dinheiro (soma nominal de 30 anos)</dt><dd className="text-right">{fmtBRL(o.cashReceived)}</dd>
              <dt className="text-mist-400">Cotas finais</dt><dd className="text-right">{fmtInt(o.finalShares)}</dd>
              <dt className="text-mist-400">Renda mensal final</dt><dd className="text-right">{fmtBRL(o.finalIncome)}</dd>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
