import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from './share';
import { formFromParams } from './form';
import { demoParams } from '../scenarios/defaults';

describe('estado compartilhável na URL', () => {
  const base = formFromParams(demoParams());
  it('ida e volta preserva parâmetros', () => {
    const s = { ticker: 'MXRF11', tab: 'aportes' as const, form: { ...base, price: '8,80', dividend: '0,095' } };
    expect(decodeShare('?' + encodeShare(s), base)).toEqual(s);
  });
  it('ignora entradas maliciosas ou inválidas', () => {
    expect(decodeShare('?t=<script>', base)).toBeNull();
    const d = decodeShare('?t=MXRF11&a=xx&price=' + '9'.repeat(50) + '&incomeGoalBasis=hack', base)!;
    expect(d.tab).toBe('nominal');
    expect(d.form.price).toBe(base.price);
    expect(d.form.incomeGoalBasis).toBe('nominal');
  });
});
