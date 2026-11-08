import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useDataStatus } from '../data';
import { ImportQuotes } from '../components/ImportQuotes';
import { PersonalQuotes } from '../components/PersonalQuotes';
import { IS_WEB } from '../mode';

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function DataStatusPage() {
  const s = useDataStatus();
  return (
    <section aria-labelledby="ds-title" className="flex flex-col gap-4">
      <div>
        <h1 id="ds-title" className="text-xl font-semibold">Cotações</h1>
        {IS_WEB && (
          <div className="card my-2 flex flex-col gap-2 p-4 text-sm text-mist-300" data-testid="quotes-howto">
            <h2 className="font-semibold text-mist-100">Como ter preços atualizados (escolha um jeito)</h2>
            <p><b className="text-gold-300">Jeito fácil — no celular ou computador:</b> 1) abra <a className="underline" href="https://brapi.dev/" target="_blank" rel="noreferrer">brapi.dev</a> e crie uma conta grátis; 2) copie a sua chave (token); 3) cole no quadro <b>"Cotações diárias automáticas"</b> logo abaixo e salve. Pronto: os preços da sua carteira e simulações se atualizam sozinhos.</p>
            <p><b className="text-gold-300">Jeito completo — no computador:</b> para ver <i>todos</i> os ativos na Tabela B3, baixe o arquivo do dia no site da B3 e envie no quadro <b>"Importar cotações"</b> abaixo.</p>
            <p className="text-xs text-mist-500">Cada pessoa da família usa a própria chave, no próprio aparelho. Nada é compartilhado.</p>
          </div>
        )}
        <details className="text-xs text-mist-500"><summary className="cursor-pointer">Detalhes técnicos</summary>
        {IS_WEB && <p className="mb-2 mt-2 rounded-lg bg-ink-850 p-3 text-xs text-mist-300 ring-1 ring-white/5" data-testid="web-mode-note"><strong>Modo site:</strong> este site publica apenas código e dados abertos (CVM, Banco Central, Tesouro, BIS, Fed, BCE). Suas cotações vêm de você — arquivo da B3 ou sua chave brapi — e ficam só neste navegador. Rendimentos de FII são estimados pela CVM (média de 12 meses; o app do computador usa os avisos exatos).</p>}
        <p className="text-sm text-mist-400">Fontes abertas (CVM, Banco Central, Tesouro, BIS, Fed, BCE) e avisos de rendimentos são consultados pelo servidor todos os dias às 9h e às 21h30 (Brasília); as cotações da B3 vêm dos arquivos que você importar. Em caso de falha, o último conjunto válido é mantido e o erro aparece aqui.</p>
        </details>
      </div>
      <PersonalQuotes />
      <ImportQuotes onImported={s.reload} />
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
