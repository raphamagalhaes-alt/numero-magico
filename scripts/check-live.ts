/**
 * Verificação ao vivo das fontes oficiais (B3 COTAHIST + Fundos.NET) para todos os ativos.
 * Uso: npm run check:live — sai com código 1 se alguma fonte falhar.
 */
import { OfficialB3FnetProvider } from '../server/providers/official';
import { validateSnapshot } from '../server/validate';
import { createFetch } from '../server/http';
import { ASSETS } from '../src/assets/registry';

const p = new OfficialB3FnetProvider({ cnpjByTicker: Object.fromEntries(Object.values(ASSETS).map((a) => [a.ticker, a.cnpj])), fetchImpl: createFetch() });
let failed = 0;
for (const t of Object.keys(ASSETS)) {
  try {
    const s = await p.fetchSnapshot(t);
    const errs = validateSnapshot(s);
    if (errs.length) throw new Error(errs.join(', '));
    const div = s.lastAnnouncedDividend ?? s.lastPaidDividend;
    console.log(`✓ ${t}: R$ ${s.lastTrade?.price} (pregão ${s.lastTrade?.sessionDate}) · rendimento ${s.lastAnnouncedDividend ? 'anunciado' : 'pago'} R$ ${div?.amountPerShare} (data-com ${div?.recordDate}, pagamento ${div?.paymentDate}) · prazo ${s.paymentLagBusinessDays} d.u.`);
  } catch (e) {
    failed++;
    console.error(`✗ ${t}: ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
