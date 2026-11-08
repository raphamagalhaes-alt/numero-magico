import { useState } from 'react';
import { BellRing, CalendarPlus, Rss } from 'lucide-react';
import { IS_WEB } from '../mode';

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Canais de alerta gratuitos para os ativos da carteira. */
export function AlertChannels({ tickers }: { tickers: string[] }) {
  const [state, setState] = useState<string | null>(null);
  const q = encodeURIComponent(tickers.join(','));
  const base = `${window.location.host}/api/alerts`;
  const ics = `${window.location.protocol}//${base}/calendar.ics?t=${q}`;
  const webcal = `webcal://${base}/calendar.ics?t=${q}`;
  const rss = `${window.location.protocol}//${base}/feed.xml?t=${q}`;

  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador não suporta notificações push.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch('/api/push/key')).json();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mxrf11' }, body: JSON.stringify({ subscription: sub.toJSON(), tickers }) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setState(`Notificações ativadas para ${tickers.join(', ')}. Você será avisado quando um novo provento for publicado.`);
    } catch (e) { setState(e instanceof Error ? e.message : String(e)); }
  };

  if (!tickers.length) return null;
  if (IS_WEB) return (
    <section className="card p-4 text-xs text-mist-400" data-testid="alert-channels">
      Alertas por calendário, RSS, notificação push e Telegram ficam no <strong className="text-mist-200">app do computador</strong> (eles precisam de um processo rodando para verificar novos avisos). No site, os novos rendimentos aparecem aqui ao abrir a carteira.
    </section>
  );
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="al-title" data-testid="alert-channels">
      <h2 id="al-title" className="flex items-center gap-2 text-sm font-medium"><BellRing size={16} className="text-gold-400" aria-hidden />Receber alertas de proventos (grátis)</h2>
      <div className="flex flex-wrap gap-2">
        <a className="btn" href={webcal} data-testid="alert-webcal"><CalendarPlus size={14} aria-hidden />Assinar no calendário</a>
        <a className="btn" href={ics} download="proventos.ics">Baixar .ics</a>
        <a className="btn" href={rss} target="_blank" rel="noreferrer noopener" data-testid="alert-rss"><Rss size={14} aria-hidden />Feed RSS</a>
        <button type="button" className="btn" onClick={enablePush} data-testid="alert-push"><BellRing size={14} aria-hidden />Notificações push</button>
      </div>
      <p className="text-[11px] text-mist-500">
        Calendário: datas-com e pagamentos aparecem no Google Agenda, Apple Calendário ou Outlook e são atualizados sozinhos (no Google: Outras agendas → Do URL → cole o link). Push: aviso no celular/computador mesmo com o app fechado (requer HTTPS fora do localhost). Telegram: configure um bot gratuito no servidor (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TICKERS).
      </p>
      {state && <p role="status" className="text-xs text-mist-300">{state}</p>}
    </section>
  );
}
