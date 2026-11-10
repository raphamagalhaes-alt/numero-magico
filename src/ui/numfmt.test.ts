import { describe, expect, it } from 'vitest';
import { amountWords, formatTyping, parseNum, regroup } from './numfmt';
import { parseBR } from './form';

describe('Separação de milhares ao digitar', () => {
  it('agrupa a parte inteira e mantém decimais', () => {
    expect(regroup('2000000')).toBe('2.000.000');
    expect(regroup('1500,5')).toBe('1.500,5');
    expect(regroup('8,89')).toBe('8,89');
    expect(regroup('0,10')).toBe('0,10');
    expect(regroup(',5')).toBe('0,5');
    expect(regroup('-3')).toBe('-3');
    expect(regroup('')).toBe('');
    expect(regroup('00012')).toBe('12');
  });
  it('digitando zero a zero até 2 milhões, com o cursor no fim', () => {
    let v = '';
    for (const ch of '2000000') { const n = v + ch; const r = formatTyping(n, v, n.length); v = r.text; expect(r.caret).toBe(v.length); }
    expect(v).toBe('2.000.000');
  });
  it('apagar um dígito reagrupa (não confunde o ponto de milhar com decimal)', () => {
    expect(formatTyping('1.00', '1.000', 4).text).toBe('100');
    expect(formatTyping('2.000.00', '2.000.000', 8).text).toBe('200.000');
  });
  it('ponto digitado agora vira vírgula decimal (teclado de celular)', () => {
    expect(formatTyping('8.', '8', 2).text).toBe('8,');
    expect(formatTyping('1.500.', '1.500', 6).text).toBe('1.500,');
    expect(formatTyping('8.', '8', 2, false).text).toBe('8');
  });
  it('valor colado/preenchido de uma vez: "5.000" é cinco mil; "8.89" é decimal', () => {
    expect(formatTyping('5.000', '', 5).text).toBe('5.000');
    expect(formatTyping('2.000.000', '', 9).text).toBe('2.000.000');
    expect(formatTyping('8.89', '', 4).text).toBe('8,89');
    expect(formatTyping('1.000,50', '', 8).text).toBe('1.000,50');
  });
  it('cursor no meio continua no lugar certo', () => {
    // "1.000" → digita 5 depois do 1: "15.000" → "15.000", cursor depois do 5
    const r = formatTyping('15.000', '1.000', 2);
    expect(r.text).toBe('15.000');
    expect(r.caret).toBe(2);
    const r2 = formatTyping('1000', '100', 4); // cursor no fim
    expect(r2).toEqual({ text: '1.000', caret: 5 });
  });
  it('leitura e extenso', () => {
    expect(parseNum('2.000.000,50')).toBe(2000000.5);
    expect(parseNum('R$ 1.500')).toBe(1500);
    expect(parseNum('')).toBeNull();
    expect(amountWords(2000000)).toBe('2 milhões');
    expect(amountWords(1000000)).toBe('1 milhão');
    expect(amountWords(25620)).toBe('25,6 mil');
    expect(amountWords(1500)).toBe('1,5 mil');
    expect(amountWords(3_200_000_000)).toBe('3,2 bilhões');
    expect(amountWords(999)).toBeNull();
  });
  it('o simulador entende "2.000" como dois mil (antes lia 2)', () => {
    expect(parseBR('2.000')).toBe('2000');
    expect(parseBR('2.000.000')).toBe('2000000');
    expect(parseBR('1.000,50')).toBe('1000.50');
    expect(parseBR('8,89')).toBe('8.89');
    expect(parseBR('0.10')).toBe('0.10'); // ponto decimal isolado continua decimal
  });
});
