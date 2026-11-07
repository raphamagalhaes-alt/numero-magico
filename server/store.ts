import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MarketSnapshot } from '../src/market/types';

export interface StoredTicker {
  snapshot: MarketSnapshot | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/** Persistência em arquivo JSON (escrita atômica). Suficiente para um único ativo/servidor. */
export class JsonStore {
  private data: Record<string, StoredTicker> = {};
  constructor(private readonly path: string) {
    if (existsSync(path)) {
      try { this.data = JSON.parse(readFileSync(path, 'utf8')); } catch { this.data = {}; }
    }
  }
  get(ticker: string): StoredTicker {
    return this.data[ticker] ?? { snapshot: null, lastAttemptAt: null, lastError: null };
  }
  set(ticker: string, v: StoredTicker) {
    this.data[ticker] = v;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
