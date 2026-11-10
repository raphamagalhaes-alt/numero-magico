/**
 * Cópia de segurança dos dados do app (tudo o que fica no aparelho) para levar a outro celular ou
 * computador. Só chaves do próprio app ("mxrf:"); caches que se recuperam sozinhos ficam de fora.
 * A chave pessoal da brapi só entra se a pessoa marcar.
 */
export const BACKUP_APP = 'numero-magico';
export const BACKUP_VERSION = 1;
const SKIP = new Set(['mxrf:markets', 'mxrf:watchlistSent']);
export interface Backup { app: string; version: number; createdAt: string; data: Record<string, unknown>; device?: { brapiToken?: string; watchlist?: string[] } }
interface KV { length: number; key(i: number): string | null; getItem(k: string): string | null }

export function buildBackup(store: KV, device: { brapiToken?: string | null; watchlist?: string[] } | null, includeKey: boolean, now = new Date()): Backup {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || !k.startsWith('mxrf:') || SKIP.has(k)) continue;
    const raw = store.getItem(k);
    if (raw === null) continue;
    try { data[k] = JSON.parse(raw); } catch { /* valor corrompido: ignora */ }
  }
  const b: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, createdAt: now.toISOString(), data };
  if (device) b.device = { watchlist: device.watchlist ?? [], ...(includeKey && device.brapiToken ? { brapiToken: device.brapiToken } : {}) };
  return b;
}

/** Valida um arquivo de cópia; devolve só o que é seguro gravar (nunca executa nada do arquivo). */
export function parseBackup(text: string): { ok: true; backup: Backup; keys: string[] } | { ok: false; error: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, error: 'Arquivo inválido: não é uma cópia do Número Mágico.' }; }
  const b = v as Partial<Backup>;
  if (!b || b.app !== BACKUP_APP || typeof b.data !== 'object' || b.data === null) return { ok: false, error: 'Arquivo inválido: não é uma cópia do Número Mágico.' };
  if (Number(b.version) > BACKUP_VERSION) return { ok: false, error: 'Cópia feita numa versão mais nova do app. Atualize a página e tente de novo.' };
  const data: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(b.data)) if (/^mxrf:[A-Za-z0-9_-]{1,40}$/.test(k) && !SKIP.has(k)) data[k] = val;
  const device = b.device && typeof b.device === 'object' ? {
    watchlist: Array.isArray(b.device.watchlist) ? b.device.watchlist.map(String).filter((t) => /^[A-Z0-9]{4,8}$/.test(t)).slice(0, 60) : [],
    ...(typeof b.device.brapiToken === 'string' && /^[A-Za-z0-9_-]{8,200}$/.test(b.device.brapiToken) ? { brapiToken: b.device.brapiToken } : {}),
  } : undefined;
  return { ok: true, backup: { app: BACKUP_APP, version: BACKUP_VERSION, createdAt: String(b.createdAt ?? ''), data, device }, keys: Object.keys(data) };
}

export type InvestorProfile = 'Conservador' | 'Moderado' | 'Arrojado';
/** Perfil de investidor educativo (não substitui o questionário oficial da corretora). */
export const PROFILE_QUESTIONS: { q: string; options: [string, number][] }[] = [
  { q: 'Se seus investimentos caíssem 20% em um mês, você…', options: [['Venderia tudo para não perder mais', 0], ['Ficaria preocupado, mas esperaria', 1], ['Aproveitaria para comprar mais', 2]] },
  { q: 'Quando vai precisar da maior parte desse dinheiro?', options: [['Em menos de 2 anos', 0], ['Entre 2 e 5 anos', 1], ['Daqui a mais de 5 anos', 2]] },
  { q: 'Você já tem reserva de emergência?', options: [['Não', 0], ['Parte dela', 1], ['Sim, completa', 2]] },
  { q: 'Quanto você conhece de ações e fundos?', options: [['Pouco ou nada', 0], ['O básico', 1], ['Bastante', 2]] },
  { q: 'O que é mais importante para você?', options: [['Não perder dinheiro', 0], ['Equilíbrio entre segurança e ganho', 1], ['Ganhar mais no longo prazo, aceitando sustos', 2]] },
];
export function scoreProfile(answers: number[]): InvestorProfile | null {
  if (answers.length !== PROFILE_QUESTIONS.length || answers.some((a) => !(a >= 0))) return null;
  const s = answers.reduce((a, b) => a + b, 0);
  // sem reserva ou com prazo curto, o perfil nunca passa de Moderado
  const cap = answers[1] === 0 || answers[2] === 0;
  const p: InvestorProfile = s <= 3 ? 'Conservador' : s <= 7 ? 'Moderado' : 'Arrojado';
  return cap && p === 'Arrojado' ? 'Moderado' : p;
}
