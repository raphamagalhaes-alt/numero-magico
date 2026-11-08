import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useDataStatus } from '../data';

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function DataStatusPage() {
  const s = useDataStatus();
  return (
    <section aria-labelledby="ds-title" className="flex flex-col gap-4">
      <div>
        <h1 id="ds-title" className="text-xl font-semibold">Status dos dados</h1>
        <p className="text-sm text-mist-400">Cada fonte oficial é consultada pelo servidor todos os dias às 9h e às 21h30 (Brasília). Em caso de falha, o último conjunto válido é mantido e o erro aparece aqui.</p>
      </div>
      {s.error && <p className="card p-4 text-sm text-loss-400" role="alert">{s.error}</p>}
      <div className="grid gap-3 md:grid-cols-2" data-testid="data-status">
        {(s.data ?? []).map((d) => (
          <div key={d.key} className={`card p-4 ${d.lastError ? 'ring-loss-500/30' : ''}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              {d.lastError ? <AlertTriangle size={16} className="text-loss-400" aria-hidden /> : <CheckCircle2 size={16} className="text-gain-400" aria-hidden />}
              {d.label}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-mist-400">Dados de referência</dt><dd className="text-right">{d.asOf ? d.asOf.split('-').reverse().join('/') : '—'}</dd>
              <dt className="text-mist-400">Última consulta bem-sucedida</dt><dd className="text-right">{dt(d.lastSuccess)}</dd>
              <dt className="text-mist-400">Última tentativa</dt><dd className="text-right">{dt(d.lastAttempt)}</dd>
              <dt className="text-mist-400">Agenda</dt><dd className="text-right">{d.schedule}</dd>
            </dl>
            {d.lastError && <p className="mt-2 text-xs text-loss-400">Erro: {d.lastError}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
