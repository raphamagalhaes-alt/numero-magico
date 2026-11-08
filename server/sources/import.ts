/**
 * Importação de arquivos COTAHIST baixados MANUALMENTE pelo usuário no site da B3.
 * A B3 proíbe a coleta automatizada da página de Cotações Históricas "para quaisquer finalidades"
 * (texto na própria página); a consulta e o download humanos, para uso pessoal, são permitidos pelos
 * Termos de Uso. O app apenas processa os arquivos que o usuário colocar na pasta de importação.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { parseCotahistAll, type CotahistRecord } from './cotahist';

export const COTAHIST_NAME = /^COTAHIST_(A\d{4}|M\d{6}|D\d{8})\.(ZIP|TXT)$/i;

export function readCotahistFile(buf: Uint8Array, name: string): CotahistRecord[] {
  if (/\.zip$/i.test(name)) {
    const files = unzipSync(buf, { filter: (f) => /\.txt$/i.test(f.name) && f.originalSize < 1.5 * 1024 * 1024 * 1024 });
    const first = Object.values(files)[0];
    if (!first) throw new Error(`${name}: ZIP sem arquivo .TXT`);
    return parseCotahistAll(strFromU8(first, true));
  }
  return parseCotahistAll(strFromU8(buf, true));
}

/** Arquivos novos ou alterados desde a última importação (chave nome+tamanho+mtime). */
export function pendingImports(dir: string, done: Record<string, string>): { name: string; path: string; key: string }[] {
  if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); return []; }
  return readdirSync(dir)
    .filter((n) => COTAHIST_NAME.test(n))
    .map((n) => { const p = join(dir, n); const s = statSync(p); return { name: n, path: p, key: `${s.size}:${s.mtimeMs}` }; })
    .filter((f) => done[f.name] !== f.key)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const readImport = (path: string) => new Uint8Array(readFileSync(path));
