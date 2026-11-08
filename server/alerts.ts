/**
 * Alertas sem custo: calendário ICS (assinável no Google/Apple/Outlook), feed RSS, Web Push
 * (padrão aberto dos navegadores, chaves VAPID geradas localmente) e Telegram (bot gratuito, opcional).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import webpush from 'web-push';
import type { DataHub } from './hub';

export interface AlertEvent { ticker: string; amount: number; recordDate: string; paymentDate: string | null; kind: string; source: string }

const TICKERS = /^[A-Z0-9]{4}\d{1,2}$/;
export const parseTickers = (q: string | null) => [...new Set((q ?? '').toUpperCase().split(',').map((t) => t.trim()).filter((t) => TICKERS.test(t)))].slice(0, 50);

export function collectEvents(hub: DataHub, tickers: string[]): AlertEvent[] {
  const out: AlertEvent[] = [];
  for (const t of tickers) {
    const meta = hub.history.meta(t);
    if (meta?.cls === 'ACAO') {
      for (const e of hub.stockDivs.get(meta.isin)) out.push({ ticker: t, amount: e.amount, recordDate: e.recordDate, paymentDate: e.paymentDate, kind: e.kind === 'JCP' ? 'JCP' : 'Dividendo', source: 'B3 — Empresas Listadas' });
    } else {
      for (const e of hub.dividends.get(t)) out.push({ ticker: t, amount: e.amount, recordDate: e.recordDate, paymentDate: e.paymentDate, kind: 'Rendimento', source: 'Fundos.NET — aviso aos cotistas' });
    }
  }
  return out.sort((a, b) => b.recordDate.localeCompare(a.recordDate));
}

const money = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const br = (iso: string) => iso.split('-').reverse().join('/');
const ics = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const day = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };

/** Calendário iCalendar (RFC 5545): eventos de dia inteiro para data-com e pagamento. */
export function toIcs(events: AlertEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Numero Magico//Proventos//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Proventos — Número Mágico', 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H'];
  const add = (uid: string, date: string, summary: string, desc: string) =>
    lines.push('BEGIN:VEVENT', `UID:${uid}@numero-magico`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`, `SUMMARY:${ics(summary)}`, `DESCRIPTION:${ics(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  for (const e of events) {
    const desc = `${e.kind} de ${money(e.amount)} por cota/ação. Data-com ${br(e.recordDate)}${e.paymentDate ? `, pagamento ${br(e.paymentDate)}` : ''}. Fonte: ${e.source}. Informação educativa; não é recomendação.`;
    add(`${e.ticker}-${e.recordDate}-com`, e.recordDate, `${e.ticker}: data-com (${money(e.amount)})`, desc);
    if (e.paymentDate) add(`${e.ticker}-${e.recordDate}-pag`, e.paymentDate, `${e.ticker}: pagamento de ${money(e.amount)}`, desc);
  }
  lines.push('END:VCALENDAR');
  // linhas longas são dobradas em 75 octetos (aprox. por caractere)
  return lines.map((l) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join('\r\n '))).join('\r\n') + '\r\n';
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function toRss(events: AlertEvent[], baseUrl: string): string {
  const items = events.slice(0, 100).map((e) => `<item><title>${xml(`${e.ticker}: ${e.kind} de ${money(e.amount)}`)}</title><guid isPermaLink="false">${xml(`${e.ticker}-${e.recordDate}`)}</guid><pubDate>${new Date(e.recordDate + 'T12:00:00-03:00').toUTCString()}</pubDate><description>${xml(`Data-com ${br(e.recordDate)}${e.paymentDate ? ` · pagamento ${br(e.paymentDate)}` : ''} · fonte: ${e.source}`)}</description><link>${xml(`${baseUrl}/#/carteira`)}</link></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Proventos — Número Mágico</title><link>${xml(baseUrl)}</link><description>Rendimentos de FIIs e proventos de ações dos ativos acompanhados (dados oficiais; informação educativa).</description><language>pt-br</language>${items}</channel></rss>`;
}

// ------------------------------- Web Push + Telegram -------------------------------
interface Sub { endpoint: string; keys: { p256dh: string; auth: string }; tickers: string[]; createdAt: string }
interface State { vapid: { publicKey: string; privateKey: string } | null; subs: Sub[]; notified: Record<string, string> }

export class AlertService {
  private s: State = { vapid: null, subs: [], notified: {} };
  constructor(private readonly path: string, private readonly opts: { subject?: string; fetchImpl?: typeof fetch; telegram?: { token: string; chatId: string; tickers: string[] } | null; send?: typeof webpush.sendNotification; log?: (m: string) => void } = {}) {
    if (existsSync(path)) { try { this.s = { ...this.s, ...JSON.parse(readFileSync(path, 'utf8')) }; } catch { /* vazio */ } }
    if (!this.s.vapid) { this.s.vapid = webpush.generateVAPIDKeys(); this.save(); }
    webpush.setVapidDetails(opts.subject ?? 'mailto:alertas@localhost', this.s.vapid.publicKey, this.s.vapid.privateKey);
  }
  get publicKey() { return this.s.vapid!.publicKey; }
  get subscriptions() { return this.s.subs.length; }
  private save() { mkdirSync(dirname(this.path), { recursive: true }); writeFileSync(this.path + '.tmp', JSON.stringify(this.s)); renameSync(this.path + '.tmp', this.path); }

  subscribe(body: unknown): string | null {
    const b = body as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; tickers?: unknown };
    const sub = b?.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return 'Assinatura inválida';
    const tickers = parseTickers(Array.isArray(b.tickers) ? b.tickers.join(',') : '');
    this.s.subs = [...this.s.subs.filter((x) => x.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth as string }, tickers, createdAt: new Date().toISOString() }].slice(-500);
    this.save();
    return null;
  }
  unsubscribe(endpoint: string) { this.s.subs = this.s.subs.filter((x) => x.endpoint !== endpoint); this.save(); }

  /** Envia apenas eventos ainda não notificados (por canal e ticker). Retorna quantas mensagens saíram. */
  async notifyNew(hub: DataHub): Promise<number> {
    let sent = 0;
    const newer = (key: string, t: string) => collectEvents(hub, [t]).filter((e) => !this.s.notified[`${key}|${t}`] || e.recordDate > this.s.notified[`${key}|${t}`]);
    const mark = (key: string, t: string, evs: AlertEvent[]) => { if (evs.length) this.s.notified[`${key}|${t}`] = evs[0].recordDate; };
    const send = this.opts.send ?? webpush.sendNotification.bind(webpush);
    for (const sub of [...this.s.subs]) {
      for (const t of sub.tickers) {
        const evs = newer(sub.endpoint, t);
        if (!evs.length) continue;
        const first = !this.s.notified[`${sub.endpoint}|${t}`];
        mark(sub.endpoint, t, evs);
        if (first) continue; // na primeira passagem só registra o histórico (não dispara alertas antigos)
        const e = evs[0];
        try {
          await send({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: `${t}: novo ${e.kind.toLowerCase()}`, body: `${money(e.amount)} · data-com ${br(e.recordDate)}${e.paymentDate ? ` · pagamento ${br(e.paymentDate)}` : ''}`, url: '/#/carteira' }), { TTL: 86400 });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) this.unsubscribe(sub.endpoint); // assinatura expirada
          else this.opts.log?.(`push falhou: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    const tg = this.opts.telegram;
    if (tg) {
      for (const t of tg.tickers) {
        const evs = newer('telegram', t);
        if (!evs.length) continue;
        const first = !this.s.notified[`telegram|${t}`];
        mark('telegram', t, evs);
        if (first) continue;
        const e = evs[0];
        const res = await (this.opts.fetchImpl ?? fetch)(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tg.chatId, text: `${t}: ${e.kind} de ${money(e.amount)}\nData-com ${br(e.recordDate)}${e.paymentDate ? ` · pagamento ${br(e.paymentDate)}` : ''}\nFonte: ${e.source}` }),
        }).catch((err) => { this.opts.log?.(`telegram falhou: ${err}`); return null; });
        if (res?.ok) sent++;
      }
    }
    this.save();
    return sent;
  }
}

export const alertsPath = (dataDir: string) => join(dataDir, 'alerts.json');
