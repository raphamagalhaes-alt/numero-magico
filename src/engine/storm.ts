/**
 * Modo tempestade: reconhece uma queda forte e transforma o pânico em números da própria pessoa
 * (reserva, renda que continua, cotas a mais que o aporte compra). Não prevê o mercado.
 */
export interface StormInput { dayPct: number | null; closes: number[]; price: number | null }

/** Tempestade = queda de 2% ou mais no dia, ou 10% ou mais abaixo do pico dos últimos 3 meses. */
export function stormLevel(i: StormInput) {
  const series = [...i.closes, ...(i.price ? [i.price] : [])].filter((v) => v > 0);
  const peak = series.length ? Math.max(...series) : null;
  const last = series.length ? series[series.length - 1] : null;
  const drawdown = peak && last ? last / peak - 1 : null;
  const dayHit = i.dayPct !== null && i.dayPct <= -0.02;
  const ddHit = drawdown !== null && drawdown <= -0.1;
  return { active: dayHit || ddHit, dayPct: i.dayPct, drawdown, peak, reason: dayHit && ddHit ? 'ambos' : dayHit ? 'dia' : ddHit ? 'pico' : null };
}

/** Quantas cotas inteiras o mesmo dinheiro compra agora vs. no preço de referência (ex.: pico). */
export function extraShares(money: number, priceNow: number, priceRef: number) {
  if (!(money > 0) || !(priceNow > 0) || !(priceRef > 0)) return { now: 0, before: 0, extra: 0 };
  const now = Math.floor(money / priceNow), before = Math.floor(money / priceRef);
  return { now, before, extra: now - before };
}

/** Quantos meses a reserva de emergência cobre das contas da casa. */
export const reserveCoverMonths = (reserve: number, monthlyBills: number) => (monthlyBills > 0 ? Math.floor((reserve / monthlyBills) * 10) / 10 : null);

/** Quedas históricas do Ibovespa (valores aproximados, arredondados), para lembrar que tempestades passam. */
export const PAST_STORMS: { when: string; what: string; after: string }[] = [
  { when: '2008', what: 'Crise financeira mundial: o Ibovespa caiu cerca de 60% entre maio e outubro.', after: 'Em 2009 o índice subiu mais de 80%.' },
  { when: 'maio de 2017', what: '"Joesley Day": queda de quase 9% em um único dia.', after: 'Em poucas semanas o índice voltou ao nível anterior.' },
  { when: '2020', what: 'Pandemia: queda de cerca de 45% entre janeiro e março, com vários circuit breakers.', after: 'Em cerca de 10 meses o índice voltou ao nível de antes da queda.' },
];
