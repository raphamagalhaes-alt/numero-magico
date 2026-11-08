import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useRemote } from '../data';

interface SettingsPublic { brapiConfigured: boolean; brapiTokenHint: string | null; watchlist: string[] }

/**
 * Cotações diárias automáticas e regulares, sem contrato: cada usuário usa a SUA chave gratuita da brapi,
 * consultada a partir do próprio computador, só para os ativos que acompanha (uso pessoal).
 */
export function PersonalQuotes() {
  const s = useRemote<SettingsPublic>('/api/settings');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (value: string | null) => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mxrf11' }, body: JSON.stringify({ brapiToken: value }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(body.error ?? `Erro ${res.status}`);
    setToken('');
    setMsg(value ? 'Chave salva neste computador. Buscando os fechamentos dos ativos acompanhados…' : 'Chave removida.');
    s.reload();
  };
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="personal-quotes" aria-labelledby="pq-title">
      <h2 id="pq-title" className="flex items-center gap-2 text-base font-semibold"><KeyRound size={16} className="text-gold-400" aria-hidden />Cotações diárias automáticas com a sua chave gratuita</h2>
      <div className="text-xs leading-relaxed text-mist-300">
        <p>Crie uma conta gratuita em <a className="underline hover:text-gold-300" href="https://brapi.dev" target="_blank" rel="noreferrer noopener">brapi.dev</a> e cole a sua chave aqui. O app passa a buscar sozinho, às 9h e às 21h30, o fechamento dos ativos da sua <strong>carteira, comparações e simulações</strong>, direto do seu computador.</p>
        <p className="mt-1 text-mist-400">Por que é regular: a chave é sua, fica só neste aparelho e os dados são para o seu uso pessoal — o app não repassa cotações a ninguém (os termos da brapi vedam redistribuição e proxy público). Plano gratuito: ~15 mil consultas/mês, 1 ativo por consulta; o app limita a 60 ativos por atualização. Para o universo completo (explorador), importe o arquivo COTAHIST abaixo de vez em quando.</p>
      </div>
      {s.data && (
        <p className="text-xs" data-testid="pq-status">
          {s.data.brapiConfigured ? <span className="text-gain-400">Chave configurada ({s.data.brapiTokenHint}).</span> : <span className="text-mist-400">Nenhuma chave configurada.</span>}
          {' '}Ativos acompanhados: {s.data.watchlist.length ? s.data.watchlist.join(', ') : 'nenhum (adicione na Minha carteira)'}.
        </p>
      )}
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (token.trim()) void save(token.trim()); }}>
        <input type="password" autoComplete="off" className="input max-w-xs" placeholder="Sua chave da brapi" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Chave da brapi" data-testid="pq-token" />
        <button className="btn btn-gold" type="submit">Salvar chave</button>
        {s.data?.brapiConfigured && <button type="button" className="btn" onClick={() => save(null)}>Remover</button>}
      </form>
      {msg && <p role="status" className="text-xs text-mist-300">{msg}</p>}
    </section>
  );
}
