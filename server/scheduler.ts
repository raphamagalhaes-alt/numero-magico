import cron from 'node-cron';
import { TZ, addDays, isTradingDay, saoPauloDate } from './calendar';

export const DAILY_CRON = '0 9 * * *';

/** Próxima execução efetiva: 9h de São Paulo (UTC−3, sem horário de verão desde 2019) em dia de pregão. */
export function nextNineAm(now: Date): string {
  let day = saoPauloDate(now);
  for (let i = 0; i < 30; i++, day = addDays(day, 1)) {
    const [y, m, d] = day.split('-').map(Number);
    const candidate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    if (candidate > now && isTradingDay(day)) return candidate.toISOString();
  }
  throw new Error('Sem pregão nos próximos 30 dias');
}

/** Decide se a rotina diária deve consultar o provedor neste dia. */
export function shouldRunOn(now: Date): { run: boolean; reason: string } {
  const day = saoPauloDate(now);
  if (!isTradingDay(day)) return { run: false, reason: `${day} não é dia de pregão (fim de semana ou feriado); cotação permanece a do último pregão.` };
  return { run: true, reason: 'dia de pregão' };
}

export function startDailyScheduler(job: () => Promise<void>, log: (m: string) => void = console.log) {
  const task = cron.schedule(DAILY_CRON, async () => {
    const d = shouldRunOn(new Date());
    if (!d.run) return log(`[agendador] ${d.reason}`);
    log('[agendador] atualização diária iniciada');
    try { await job(); } catch (e) { log(`[agendador] falha: ${e instanceof Error ? e.message : e}`); }
  }, { timezone: TZ, name: 'atualizacao-diaria-mercado', noOverlap: true });
  return task;
}
