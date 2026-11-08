/** Camada de servidor do calendário: carrega feriados extras (manuais e aprendidos) de arquivos. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerExtraHolidays, extraHolidays, saoPauloDate } from '../src/engine/calendar';

export * from '../src/engine/calendar';

const here = dirname(fileURLToPath(import.meta.url));
export const MANUAL_HOLIDAYS_FILE = join(here, 'data', 'holidays-extra.json');

/** Formato: { confirmed: [datas], pending: { data: dia da 1ª observação } }. Aceita o formato antigo (array). */
interface Learned { confirmed: string[]; pending: Record<string, string> }

function readLearned(p: string): Learned {
  if (!existsSync(p)) return { confirmed: [], pending: {} };
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'));
    if (Array.isArray(v)) return { confirmed: v.filter((x) => typeof x === 'string'), pending: {} };
    return { confirmed: Array.isArray(v?.confirmed) ? v.confirmed : [], pending: v?.pending && typeof v.pending === 'object' ? v.pending : {} };
  } catch { return { confirmed: [], pending: {} }; }
}

function readList(p: string): string[] {
  if (!existsSync(p)) return [];
  try { const v = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Carrega feriados extraordinários manuais e os aprendidos JÁ CONFIRMADOS. */
export function loadExtraHolidays(learnedFile: string) {
  registerExtraHolidays(readList(MANUAL_HOLIDAYS_FILE));
  registerExtraHolidays(readLearned(learnedFile).confirmed);
}

/**
 * Registra dias úteis sem arquivo da B3. Um dia só vira "sem pregão" quando a ausência é observada
 * de novo em outro dia de consulta — evita que uma falha transitória de publicação vire feriado.
 * Retorna as datas confirmadas nesta chamada.
 */
export function learnHolidays(learnedFile: string, dates: string[], now = new Date()): string[] {
  if (!dates.length) return [];
  const today = saoPauloDate(now);
  const l = readLearned(learnedFile);
  const confirmed: string[] = [];
  for (const d of dates) {
    if (l.confirmed.includes(d)) continue;
    const first = l.pending[d];
    if (first && first < today) { l.confirmed.push(d); delete l.pending[d]; confirmed.push(d); }
    else if (!first) l.pending[d] = today;
  }
  l.confirmed.sort();
  mkdirSync(dirname(learnedFile), { recursive: true });
  writeFileSync(learnedFile, JSON.stringify(l, null, 2));
  registerExtraHolidays(confirmed);
  return confirmed;
}

export { extraHolidays };
