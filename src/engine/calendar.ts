/**
 * Calendário de pregões da B3, compartilhado entre motor e servidor (sem dependências de Node).
 * Regras: fins de semana, feriados nacionais fixos e móveis (via Páscoa), 24/12 e 31/12,
 * mais dias sem pregão registrados dinamicamente (registerExtraHolidays) — o servidor
 * alimenta essa lista com dias úteis em que a B3 não publicou arquivo de cotações.
 */
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

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const extra = new Set<string>();
/** Registra dias sem pregão adicionais (feriados extraordinários, fechamentos da B3). */
export function registerExtraHolidays(dates: Iterable<string>) {
  for (const d of dates) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) extra.add(d);
}
export function extraHolidays(): string[] {
  return [...extra].sort();
}

const cache = new Map<number, Set<string>>();
export function b3Holidays(year: number): Set<string> {
  let s = cache.get(year);
  if (!s) {
    const e = easterSunday(year);
    const easter = `${year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
    const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-24', '12-25', '12-31'];
    if (year >= 2024) fixed.push('11-20'); // Dia da Consciência Negra (Lei 14.759/2023)
    s = new Set(fixed.map((md) => `${year}-${md}`));
    s.add(addDays(easter, -48)); // segunda de Carnaval
    s.add(addDays(easter, -47)); // terça de Carnaval
    s.add(addDays(easter, -2)); // Sexta-feira Santa
    s.add(addDays(easter, 60)); // Corpus Christi
    cache.set(year, s);
  }
  return s;
}

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function saoPauloDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
/** Hora (0–23) no fuso de São Paulo. */
export function saoPauloHour(at: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(at));
}

export function isWeekend(isoDate: string): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

export function isTradingDay(isoDate: string): boolean {
  if (isWeekend(isoDate)) return false;
  if (extra.has(isoDate)) return false;
  return !b3Holidays(Number(isoDate.slice(0, 4))).has(isoDate);
}

/** Último pregão estritamente antes da data informada. */
export function previousTradingDay(isoDate: string): string {
  let cur = addDays(isoDate, -1);
  for (let i = 0; i < 30 && !isTradingDay(cur); i++) cur = addDays(cur, -1);
  return cur;
}

/** Soma n dias úteis (pregões) a uma data. */
export function addBusinessDays(isoDate: string, n: number): string {
  let cur = isoDate;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isTradingDay(cur)) left--;
  }
  return cur;
}

/** Último dia útil de um mês (AAAA-MM). */
export function lastBusinessDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstNext = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return previousTradingDay(firstNext);
}

/** Soma meses a AAAA-MM. */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Conta dias úteis entre duas datas (exclui a inicial, inclui a final). */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let cur = addDays(from, 1); cur <= to; cur = addDays(cur, 1)) if (isTradingDay(cur)) n++;
  return n;
}

/**
 * Pregão mais recente cujo fechamento já deveria estar publicado.
 * A B3 publica o arquivo do dia após o encerramento; consideramos disponível a partir das 21h.
 */
export function latestClosedSession(now: Date, publishHour = 21): string {
  const today = saoPauloDate(now);
  if (isTradingDay(today) && saoPauloHour(now) >= publishHour) return today;
  return previousTradingDay(today);
}

/** Dados desatualizados: cotação anterior ao último pregão encerrado ou consulta com mais de 36h. */
export function isStale(tradeSessionDate: string | null, fetchedIso: string | null, now: Date): boolean {
  if (!tradeSessionDate || !fetchedIso) return true;
  if (tradeSessionDate.slice(0, 10) < latestClosedSession(now)) return true;
  return now.getTime() - new Date(fetchedIso).getTime() > 36 * 3600 * 1000;
}
