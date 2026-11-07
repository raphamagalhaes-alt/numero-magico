import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

export function Stat({ label, value, sub, help, tone = 'default', testId, big }: {
  label: string; value: ReactNode; sub?: ReactNode; help?: string;
  tone?: 'default' | 'gold' | 'gain' | 'loss'; testId?: string; big?: boolean;
}) {
  const color = tone === 'gold' ? 'text-gold-300' : tone === 'gain' ? 'text-gain-400' : tone === 'loss' ? 'text-loss-400' : 'text-mist-100';
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <div className="label flex items-center gap-1">{label}{help && <InfoTip text={help} label={`Ajuda: ${label}`} />}</div>
      <div data-testid={testId} className={`num truncate font-semibold ${big ? 'text-3xl sm:text-4xl' : 'text-xl'} ${color}`}>{value}</div>
      {sub && <div className="text-xs text-mist-400">{sub}</div>}
    </div>
  );
}
