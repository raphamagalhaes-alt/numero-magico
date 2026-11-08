/**
 * Leitura do COTAHIST no navegador, em fluxo (streaming): descompacta e interpreta linha a linha,
 * sem carregar o arquivo inteiro descompactado na memória (o anual tem ~700 MB de texto).
 */
import { Unzip, UnzipInflate } from 'fflate';
import { parseCotahistLine, type CotahistRecord } from '../../server/sources/cotahist';

export async function readCotahistStream(file: File, onProgress?: (fraction: number) => void): Promise<CotahistRecord[]> {
  const out: CotahistRecord[] = [];
  const dec = new TextDecoder('latin1');
  let rest = '';
  const feed = (chunk: Uint8Array, final: boolean) => {
    const text = rest + dec.decode(chunk, { stream: !final });
    const lines = text.split('\n');
    rest = final ? '' : lines.pop() ?? '';
    for (const l of lines) { const r = parseCotahistLine(l.replace(/\r$/, '')); if (r) out.push(r); }
  };
  const reader = file.stream().getReader();
  let read = 0;
  if (/\.zip$/i.test(file.name)) {
    let done = false;
    let err: Error | null = null;
    const unzip = new Unzip((f) => {
      if (!/\.txt$/i.test(f.name)) return;
      f.ondata = (e, data, final) => { if (e) { err = e; return; } feed(data, final); if (final) done = true; };
      f.start();
    });
    unzip.register(UnzipInflate);
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) { unzip.push(new Uint8Array(0), true); break; }
      read += value.length; onProgress?.(read / file.size);
      unzip.push(value, false);
      if (err) throw err;
    }
    if (err) throw err;
    if (!done && !out.length) throw new Error('ZIP sem arquivo .TXT de cotações');
  } else {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { feed(new Uint8Array(0), true); break; }
      read += value.length; onProgress?.(read / file.size);
      feed(value, false);
    }
  }
  return out;
}
