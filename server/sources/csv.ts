/** Parser CSV RFC 4180 (aspas, separador configurável). */
export function parseCsv(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Converte linhas em objetos usando o cabeçalho. */
export function csvObjects(text: string, sep = ','): Record<string, string>[] {
  const [head, ...rest] = parseCsv(text, sep);
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** "13,75" → 13.75; "1.234,5" → 1234.5; vazio → null. */
export function brNumber(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}
/** dd/mm/aaaa → aaaa-mm-dd */
export const brDate = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : s);
