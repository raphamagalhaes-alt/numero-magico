/**
 * Gera arquivos COTAHIST SINTÉTICOS (layout posicional oficial, valores inventados) para os testes.
 * Não usamos recortes reais da B3 no repositório: os Termos de Uso vedam a redistribuição dos dados.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Row { date: string; bdi: string; ticker: string; tpm?: string; name: string; spec: string; open: number; high: number; low: number; close: number; trades: number; volume: number; isin: string; factor?: number }
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const num = (v: number, n: number) => String(Math.round(v * 100)).padStart(n, '0');
export function line(r: Row): string {
  const d = r.date.replace(/-/g, '');
  let s = '01' + d + r.bdi + pad(r.ticker, 12) + (r.tpm ?? '010') + pad(r.name, 12) + pad(r.spec, 10) + '   ' + 'R$  ';
  s += num(r.open, 13) + num(r.high, 13) + num(r.low, 13) + num((r.open + r.close) / 2, 13) + num(r.close, 13);
  s += num(r.close, 13) + num(r.close + 0.01, 13); // PREOFC, PREOFV
  s += String(r.trades).padStart(5, '0') + String(r.trades * 100).padStart(18, '0') + num(r.volume, 18);
  s += '0'.repeat(13) + '0' + '00000000' + String(r.factor ?? 1).padStart(7, '0') + '0'.repeat(13) + pad(r.isin, 12) + '000';
  return s;
}

const D = '2026-11-06';
const rows: Row[] = [
  { date: D, bdi: '02', ticker: 'PETR4', name: 'EXEMPLO PET', spec: 'PN      N2', open: 40.1, high: 41.2, low: 39.9, close: 40.5, trades: 50000, volume: 1500000000, isin: 'BRPETRACNPR6' },
  { date: D, bdi: '02', ticker: 'VALE3', name: 'EXEMPLO VAL', spec: 'ON      NM', open: 60, high: 61, low: 59.5, close: 60.2, trades: 40000, volume: 1100000000, isin: 'BRVALEACNOR0' },
  { date: D, bdi: '14', ticker: 'BOVA11', name: 'ISHARES BOVA', spec: 'CI  ATZ', open: 150, high: 151, low: 149, close: 150.5, trades: 20000, volume: 600000000, isin: 'BRBOVACTF003' },
  { date: D, bdi: '14', ticker: 'IVVB11', name: 'ISHARES SP5', spec: 'CI', open: 400, high: 402, low: 399, close: 401, trades: 9000, volume: 90000000, isin: 'BRIVVBCTF001' },
  { date: D, bdi: '34', ticker: 'AAPL34', name: 'APPLE', spec: 'DRN', open: 80, high: 81, low: 79.5, close: 80.4, trades: 3000, volume: 30000000, isin: 'BRAAPLBDR004' },
  { date: D, bdi: '12', ticker: 'MXRF11', name: 'FII MAXI REN', spec: 'CI', open: 9.0, high: 9.2, low: 8.95, close: 9.1, trades: 55000, volume: 25000000, isin: 'BRMXRFCTF008' },
  { date: D, bdi: '12', ticker: 'HGLG11', name: 'FII HGLG PAX', spec: 'CI', open: 150, high: 152, low: 149.5, close: 151.25, trades: 10000, volume: 18000000, isin: 'BRHGLGCTF004' },
  { date: D, bdi: '13', ticker: 'BBGO11', name: 'FIAGRO BBGO', spec: 'CI  ER', open: 85, high: 86, low: 84, close: 85.5, trades: 900, volume: 900000, isin: 'BRBBGOCTF009' },
  { date: D, bdi: '36', ticker: 'BIEM39', name: 'ISHARESEMRG', spec: 'DRE', open: 70, high: 71, low: 69, close: 70.5, trades: 50, volume: 100000, isin: 'BRBIEMBDR005' },
  { date: D, bdi: '96', ticker: 'PETR4F', tpm: '020', name: 'EXEMPLO PET', spec: 'PN      N2', open: 40.1, high: 41.2, low: 39.9, close: 40.5, trades: 5000, volume: 1000000, isin: 'BRPETRACNPR6' },
  { date: D, bdi: '78', ticker: 'TOTSL30', tpm: '070', name: 'TOTS', spec: 'ON      NM', open: 1, high: 1, low: 1, close: 1, trades: 1, volume: 100, isin: 'BRTOTSACNOR8' },
];
const dir = join(import.meta.dirname, '..', 'server', 'fixtures');
writeFileSync(join(dir, 'cotahist-multi-2026-11-06.txt'), rows.map(line).join('\n') + '\n', 'latin1');
writeFileSync(join(dir, 'cotahist-2026-11-06-excerpt.txt'), rows.filter((r) => r.ticker === 'MXRF11' || r.ticker === 'HGLG11').map(line).join('\n') + '\n', 'latin1');
console.log('fixtures sintéticos gerados');
