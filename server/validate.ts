import type { DividendEvent, MarketSnapshot } from '../src/market/types';

const DEC = /^\d+(\.\d+)?$/;
const isDate = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
/** Links de fonte: somente https (bloqueia javascript:, data: etc.). */
export const isSafeUrl = (u: unknown) => u === undefined || (typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u));

function checkDividend(d: DividendEvent | null, label: string, errs: string[]) {
  if (d === null) return;
  if (typeof d.amountPerShare !== 'string' || !DEC.test(d.amountPerShare)) errs.push(`${label}: valor por cota inválido`);
  if (!isDate(d.recordDate)) errs.push(`${label}: data-com inválida`);
  if (!isDate(d.paymentDate)) errs.push(`${label}: data de pagamento inválida`);
  if (!d.source) errs.push(`${label}: fonte ausente`);
  if (!isSafeUrl(d.sourceUrl)) errs.push(`${label}: link da fonte inválido`);
}

/** Rejeita snapshots incompletos ou sem procedência — melhor manter o último válido. */
export function validateSnapshot(s: MarketSnapshot): string[] {
  const errs: string[] = [];
  if (!s || typeof s !== 'object') return ['resposta vazia'];
  if (s.lastTrade) {
    if (!DEC.test(String(s.lastTrade.price)) || Number(s.lastTrade.price) <= 0) errs.push('preço inválido');
    if (!isDate(s.lastTrade.tradedAt)) errs.push('horário do negócio inválido');
    if (!s.lastTrade.source) errs.push('fonte da cotação ausente');
    if (!isSafeUrl(s.lastTrade.sourceUrl)) errs.push('link da fonte da cotação inválido');
    if (s.lastTrade.sessionDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.lastTrade.sessionDate)) errs.push('data do pregão inválida');
  }
  checkDividend(s.lastPaidDividend ?? null, 'rendimento pago', errs);
  checkDividend(s.lastAnnouncedDividend ?? null, 'rendimento anunciado', errs);
  if (!s.lastTrade && !s.lastPaidDividend && !s.lastAnnouncedDividend) errs.push('nenhum dado de mercado');
  return errs;
}
