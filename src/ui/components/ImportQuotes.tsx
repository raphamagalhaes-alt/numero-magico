import { useState } from 'react';
import { FileUp, Scale } from 'lucide-react';
import { invalidateData, useRemote } from '../data';
import { IS_WEB } from '../mode';

interface Compliance { b3Authorized: boolean; b3PublicBlock: boolean; importDir: string; automatedQuotes: boolean }
const B3_PAGE = 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/';

/** Importação manual de COTAHIST: o usuário baixa no site da B3 e o app processa automaticamente. */
export function ImportQuotes({ onImported }: { onImported?: () => void }) {
  const c = useRemote<Compliance>('/api/compliance');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    const results: string[] = [];
    let ok = true;
    for (const f of Array.from(files)) {
      try {
        const res = await fetch('/api/import/cotahist', { method: 'POST', headers: { 'X-Requested-With': 'mxrf11', 'X-File-Name': f.name, 'Content-Type': 'application/octet-stream' }, body: f });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        results.push(`${f.name}: ${body.sessions} pregões`);
      } catch (e) { ok = false; results.push(`${f.name}: ${e instanceof Error ? e.message : e}`); }
    }
    setMsg({ ok, text: results.join(' · ') });
    setBusy(false);
    invalidateData();
    onImported?.();
  };
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="import-quotes" aria-labelledby="imp-title">
      <h2 id="imp-title" className="flex items-center gap-2 text-base font-semibold"><Scale size={16} className="text-gold-400" aria-hidden />Cotações da B3: termos de uso e importação</h2>
      <div className="text-xs leading-relaxed text-mist-300">
        <p>A B3 permite o uso dos dados do seu site <strong>exclusivamente para uso pessoal</strong> e <strong>proíbe a coleta automatizada</strong> da página de Cotações Históricas "para quaisquer finalidades, comerciais ou não". Publicar cotações para terceiros exige <strong>autorização prévia e por escrito</strong> (contrato de distribuição de market data). Por isso este app não baixa as cotações sozinho: você baixa o arquivo no site da B3 e o app faz todo o resto.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-mist-400">
          <li>Abra a página <a className="underline hover:text-gold-300" href={B3_PAGE} target="_blank" rel="noreferrer noopener">Cotações Históricas da B3</a> e baixe o arquivo do último pregão (diário), do mês ou do ano.</li>
          {IS_WEB
            ? <li>Envie aqui. O arquivo é lido <strong>dentro do seu navegador</strong>: nada é enviado a servidores. Dica: no celular, prefira o arquivo diário ou mensal (o anual é grande).</li>
            : <li>Envie aqui (ou coloque na pasta <code className="text-mist-200">{c.data?.importDir ?? 'server/data/import'}</code>). O app processa às 9h e 21h30 e a cada envio.</li>}
        </ol>
      </div>
      {c.data?.automatedQuotes && <p className="text-xs text-gain-400">Download automático habilitado (B3_MARKET_DATA_AUTHORIZED=1: o operador declarou ter autorização da B3).</p>}
      <label className={`btn btn-gold w-fit cursor-pointer ${busy ? 'opacity-60' : ''}`}>
        <FileUp size={14} aria-hidden />{busy ? 'Processando…' : 'Enviar arquivo(s) COTAHIST'}
        <input type="file" multiple accept=".zip,.ZIP,.txt,.TXT" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} data-testid="import-file" />
      </label>
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-gain-400' : 'text-loss-400'}`}>{msg.text}</p>}
    </section>
  );
}
