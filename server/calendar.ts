/** Camada de servidor do calendário: carrega feriados extras (manuais e aprendidos) de arquivos. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerExtraHolidays, extraHolidays } from '../src/engine/calendar';

export * from '../src/engine/calendar';

const here = dirname(fileURLToPath(import.meta.url));
export const MANUAL_HOLIDAYS_FILE = join(here, 'data', 'holidays-extra.json');

function readList(p: string): string[] {
  if (!existsSync(p)) return [];
  try { const v = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Carrega feriados extraordinários manuais e os aprendidos (dias úteis sem arquivo da B3). */
export function loadExtraHolidays(learnedFile: string) {
  registerExtraHolidays(readList(MANUAL_HOLIDAYS_FILE));
  registerExtraHolidays(readList(learnedFile));
}

/** Persiste novos dias sem pregão detectados. */
export function learnHolidays(learnedFile: string, dates: string[]) {
  if (!dates.length) return;
  const all = new Set([...readList(learnedFile), ...dates]);
  mkdirSync(dirname(learnedFile), { recursive: true });
  writeFileSync(learnedFile, JSON.stringify([...all].sort(), null, 2));
  registerExtraHolidays(dates);
}

export { extraHolidays };
