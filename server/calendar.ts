/**
 * Calendário de pregões da B3 (aproximação documentada): fins de semana, feriados
 * nacionais (fixos e móveis), 24/12 e 31/12. Feriados extraordinários devem ser
 * incluídos em server/data/holidays-extra.json.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const TZ = 'America/Sao_Paulo';

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(y: number, m: number, d: number, n: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt);
}

let extra: Set<string> | null = null;
function extraHolidays(): Set<string> {
  if (extra) return extra;
  const p = join(dirname(fileURLToPath(import.meta.url)), 'data', 'holidays-extra.json');
  extra = new Set(existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as string[]) : []);
  return extra;
}

export function b3Holidays(year: number): Set<string> {
  const e = easterSunday(year);
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-24', '12-25', '12-31'];
  if (year >= 2024) fixed.push('11-20'); // Dia da Consciência Negra (Lei 14.759/2023)
  const s = new Set(fixed.map((md) => `${year}-${md}`));
  s.add(addDays(year, e.month, e.day, -48)); // segunda de Carnaval
  s.add(addDays(year, e.month, e.day, -47)); // terça de Carnaval
  s.add(addDays(year, e.month, e.day, -2)); // Sexta-feira Santa
  s.add(addDays(year, e.month, e.day, 60)); // Corpus Christi
  for (const h of extraHolidays()) if (h.startsWith(String(year))) s.add(h);
  return s;
}

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function saoPauloDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function isTradingDay(isoDate: string): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !b3Holidays(y).has(isoDate);
}

/** Último pregão encerrado estritamente antes da data informada. */
export function previousTradingDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  let cur = addDays(y, m, d, -1);
  for (let i = 0; i < 15 && !isTradingDay(cur); i++) {
    const [a, b, c] = cur.split('-').map(Number);
    cur = addDays(a, b, c, -1);
  }
  return cur;
}

/**
 * Dados são considerados desatualizados quando a cotação é anterior ao último pregão
 * encerrado (às 9h ainda não há pregão do dia) ou quando a última consulta tem mais de 36h.
 */
export function isStale(tradeIso: string | null, fetchedIso: string | null, now: Date): boolean {
  if (!tradeIso || !fetchedIso) return true;
  const expected = previousTradingDay(saoPauloDate(now));
  const tradeDay = saoPauloDate(new Date(tradeIso));
  if (tradeDay < expected) return true;
  return now.getTime() - new Date(fetchedIso).getTime() > 36 * 3600 * 1000;
}
