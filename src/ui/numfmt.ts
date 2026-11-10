/**
 * Números digitados em pt-BR: separa os milhares ENQUANTO a pessoa digita (2000000 → 2.000.000) e
 * diz o valor por extenso (2 milhões). Pontos são separadores de milhar; vírgula é a decimal. Um ponto
 * digitado agora (não um dos nossos separadores) vira vírgula — teclados de celular às vezes só têm ponto.
 */
const DIGIT = /[0-9]/;

/** Agrupa a parte inteira com pontos, mantendo sinal, vírgula e decimais como digitados. */
export function regroup(s: string): string {
  const neg = s.trim().startsWith('-');
  const clean = s.replace(/[^0-9,]/g, '');
  const i = clean.indexOf(',');
  const intRaw = (i < 0 ? clean : clean.slice(0, i)).replace(/^0+(?=\d)/, '');
  const dec = i < 0 ? null : clean.slice(i + 1).replace(/,/g, '');
  const int = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!int && dec === null) return neg ? '-' : '';
  return `${neg ? '-' : ''}${int || (dec !== null ? '0' : '')}${dec !== null ? `,${dec}` : ''}`;
}

/**
 * Formata o texto novo do campo. `prev` é o texto anterior (para saber se um ponto foi digitado agora),
 * `caret` a posição do cursor no texto novo. Devolve o texto formatado e onde o cursor deve ficar.
 */
export function formatTyping(next: string, prev: string, caret: number, allowDecimals = true): { text: string; caret: number } {
  let s = next;
  const dots = (x: string) => (x.match(/\./g) ?? []).length;
  const typedOne = s.length === prev.length + 1;
  if (allowDecimals && !s.includes(',') && dots(s) > dots(prev)) {
    if (typedOne && s[caret - 1] === '.') {
      // um ponto acabou de ser digitado: vira vírgula decimal (teclado de celular)
      s = `${s.slice(0, caret - 1)},${s.slice(caret)}`;
    } else if (!typedOne && !/^-?\d{1,3}(\.\d{3})+$/.test(s.trim()) && dots(s) === 1) {
      // valor colado com um único ponto que não é de milhar ("8.89"): é decimal
      s = s.replace('.', ',');
    }
    // colado como "5.000" ou "2.000.000": pontos de milhar, mantidos como separadores
  }
  if (!allowDecimals) s = s.replace(/,/g, '');
  // quantos dígitos/vírgula havia antes do cursor (para devolvê-lo ao mesmo lugar)
  let keep = 0;
  for (let k = 0; k < Math.min(caret, s.length); k++) if (DIGIT.test(s[k]) || s[k] === ',') keep++;
  const text = regroup(s);
  let pos = 0, seen = 0;
  if (text.startsWith('-')) pos = 1;
  while (pos < text.length && seen < keep) { if (DIGIT.test(text[pos]) || text[pos] === ',') seen++; pos++; }
  if (keep === 0 && text.startsWith('-')) pos = 1;
  return { text, caret: pos };
}

/** Lê um número em pt-BR ("2.000.000,50" → 2000000.5). null se vazio/inválido. */
export function parseNum(s: string): number | null {
  const t = String(s ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s|%/g, '');
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 2 : 1 });
/** Valor por extenso, para quem não conta zeros: 25.620 → "25,6 mil"; 2.000.000 → "2 milhões". */
export function amountWords(n: number | null): string | null {
  if (n === null || !Number.isFinite(n) || Math.abs(n) < 1000) return null;
  const a = Math.abs(n), sign = n < 0 ? 'menos ' : '';
  const units: [number, string, string][] = [[1e12, 'trilhão', 'trilhões'], [1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']];
  for (const [base, one, many] of units) {
    if (a >= base) {
      const v = Math.floor((a / base) * (a / base < 10 ? 100 : 10)) / (a / base < 10 ? 100 : 10);
      return `${sign}${fmt(v)} ${v < 2 ? one : many}`;
    }
  }
  return null;
}
