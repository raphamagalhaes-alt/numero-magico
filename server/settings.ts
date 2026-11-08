/** Configurações locais do usuário (ficam só no aparelho dele). A chave da brapi nunca é devolvida inteira à interface. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Settings { brapiToken: string | null; watchlist: string[] }
const TICKER = /^[A-Z0-9]{4}\d{1,2}$/;

export class SettingsStore {
  s: Settings = { brapiToken: null, watchlist: [] };
  constructor(private readonly path: string) {
    if (existsSync(path)) { try { this.s = { ...this.s, ...JSON.parse(readFileSync(path, 'utf8')) }; } catch { /* padrão */ } }
  }
  update(p: { brapiToken?: string | null; watchlist?: unknown }) {
    if (p.brapiToken !== undefined) this.s.brapiToken = p.brapiToken && /^[A-Za-z0-9_-]{8,200}$/.test(p.brapiToken) ? p.brapiToken : null;
    if (Array.isArray(p.watchlist)) this.s.watchlist = [...new Set(p.watchlist.map(String).map((t) => t.toUpperCase()).filter((t) => TICKER.test(t)))].slice(0, 60);
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.s), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
  }
  public() { return { brapiConfigured: Boolean(this.s.brapiToken), brapiTokenHint: this.s.brapiToken ? `…${this.s.brapiToken.slice(-4)}` : null, watchlist: this.s.watchlist }; }
}
