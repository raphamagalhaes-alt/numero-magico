/** Histórico persistido em arquivo JSON (servidor local / app desktop). */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HistoryData, type HistoryJson } from '../../src/market/history-core';

export class HistoryStore extends HistoryData {
  constructor(private readonly path: string, maxSessions = 300) {
    let data: HistoryJson | null = null;
    if (existsSync(path)) {
      try { data = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error('[history] arquivo ilegível, iniciando vazio', e instanceof Error ? e.message : e); }
    }
    super(maxSessions, data);
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d));
    renameSync(tmp, this.path);
  }
}
