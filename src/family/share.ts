/**
 * Metas da família SEM servidor: cada pessoa gera um código (ou imagem) com o próprio progresso e
 * manda para quem quiser, pelo WhatsApp por exemplo. Quem recebe cola o código e vê o quadro da
 * família. Por padrão o código NÃO leva valores em reais — só nome/apelido, % e contas pagas.
 */
export interface FamilyCard { name: string; pct: number; covered: string[]; next: string | null; date: string; income?: number; total?: number }
const PREFIX = 'NM1:';

const b64e = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64d = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
const clean = (s: unknown, max: number) => [...String(s ?? '')].filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('').trim().slice(0, max);

export function encodeCard(c: FamilyCard, withValues: boolean): string {
  const body: FamilyCard = { name: clean(c.name, 30) || 'Eu', pct: Math.round(Math.min(1, Math.max(0, c.pct)) * 1000) / 1000, covered: c.covered.map((x) => clean(x, 30)).slice(0, 30), next: c.next ? clean(c.next, 30) : null, date: c.date };
  if (withValues) { body.income = Math.round((c.income ?? 0) * 100) / 100; body.total = Math.round((c.total ?? 0) * 100) / 100; }
  return PREFIX + b64e(JSON.stringify(body));
}

/** Lê um código recebido; devolve null se não for um código válido (nunca executa nada dele). */
export function decodeCard(code: string): FamilyCard | null {
  const s = code.trim();
  const at = s.indexOf(PREFIX);
  if (at < 0) return null;
  try {
    const v = JSON.parse(b64d(s.slice(at + PREFIX.length).split(/\s/)[0])) as Record<string, unknown>;
    const pct = Number(v.pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1 || !Array.isArray(v.covered) || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.date))) return null;
    const out: FamilyCard = { name: clean(v.name, 30) || 'Familiar', pct, covered: v.covered.map((x) => clean(x, 30)).filter(Boolean).slice(0, 30), next: v.next ? clean(v.next, 30) : null, date: String(v.date) };
    if (Number.isFinite(Number(v.income))) out.income = Number(v.income);
    if (Number.isFinite(Number(v.total))) out.total = Number(v.total);
    return out;
  } catch { return null; }
}
