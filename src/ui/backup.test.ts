import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, scoreProfile } from './backup';

const store = (o: Record<string, string>) => ({ length: Object.keys(o).length, key: (i: number) => Object.keys(o)[i] ?? null, getItem: (k: string) => o[k] ?? null });

describe('Cópia de segurança', () => {
  const s = store({ 'mxrf:positions': '[{"ticker":"MXRF11","shares":10}]', 'mxrf:markets': '{"q":{}}', 'outro:app': '"x"', 'mxrf:quebrado': '{', 'mxrf:familyName': '"Rapha"' });
  it('leva só os dados do app, sem caches e sem a chave da brapi (a não ser que a pessoa marque)', () => {
    const b = buildBackup(s, { brapiToken: 'chave-secreta-123', watchlist: ['MXRF11'] }, false, new Date('2026-11-10T12:00:00Z'));
    expect(Object.keys(b.data).sort()).toEqual(['mxrf:familyName', 'mxrf:positions']);
    expect(b.device).toEqual({ watchlist: ['MXRF11'] });
    expect(buildBackup(s, { brapiToken: 'chave-secreta-123' }, true).device!.brapiToken).toBe('chave-secreta-123');
  });
  it('restaura com validação: ignora chaves estranhas e rejeita arquivos de outro app', () => {
    const good = JSON.stringify({ app: 'numero-magico', version: 1, createdAt: 'x', data: { 'mxrf:positions': [], 'mxrf:../../x': 1, 'localStorage.clear()': 1, 'mxrf:markets': {} }, device: { brapiToken: 'abc', watchlist: ['PETR4', '<script>'] } });
    const r = parseBackup(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keys).toEqual(['mxrf:positions']);
      expect(r.backup.device).toEqual({ watchlist: ['PETR4'] }); // chave curta/ inválida descartada
    }
    expect(parseBackup('{"app":"outro","data":{}}').ok).toBe(false);
    expect(parseBackup('não é json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'numero-magico', version: 99, data: {} })).ok).toBe(false);
  });
});

describe('Perfil de investidor (educativo)', () => {
  it('pontua e limita a Moderado sem reserva ou com prazo curto', () => {
    expect(scoreProfile([0, 0, 0, 0, 0])).toBe('Conservador');
    expect(scoreProfile([1, 1, 1, 1, 1])).toBe('Moderado');
    expect(scoreProfile([2, 2, 2, 2, 2])).toBe('Arrojado');
    expect(scoreProfile([2, 2, 0, 2, 2])).toBe('Moderado');
    expect(scoreProfile([1, 1])).toBeNull();
  });
});
