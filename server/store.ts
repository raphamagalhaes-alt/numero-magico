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
      try {
        const v = JSON.parse(readFileSync(path, 'utf8'));
        this.data = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch (e) {
        console.error(`[store] arquivo ${path} ilegível, iniciando vazio:`, e instanceof Error ? e.message : e);
        this.data = {};
      }
    }
  }
  get(ticker: string): StoredTicker {
    const v = Object.hasOwn(this.data, ticker) ? this.data[ticker] : null;
    return v && typeof v === 'object' ? { snapshot: v.snapshot ?? null, lastAttemptAt: v.lastAttemptAt ?? null, lastError: v.lastError ?? null } : { snapshot: null, lastAttemptAt: null, lastError: null };
  }
  set(ticker: string, v: StoredTicker) {
    this.data[ticker] = v;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
