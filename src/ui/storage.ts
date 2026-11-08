/** Persistência local de preferências não sensíveis. Sempre tolerante a falhas e a dados adulterados. */
type Shape<T> = { [K in keyof T]: T[K] };

/** Carrega um objeto, aceitando apenas chaves conhecidas cujo tipo coincide com o do valor padrão. */
export function load<T extends object>(key: string, fallback: T, validate?: (v: Shape<T>) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const out = { ...fallback } as Record<string, unknown>;
    for (const k of Object.keys(fallback)) {
      if (Object.hasOwn(parsed, k) && typeof parsed[k] === typeof (fallback as Record<string, unknown>)[k]) out[k] = parsed[k];
    }
    return validate && !validate(out as Shape<T>) ? fallback : (out as T);
  } catch {
    return fallback;
  }
}
export function loadRaw<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* modo privado ou armazenamento bloqueado */
  }
}
export function clearAll() {
  try { for (const k of Object.keys(window.localStorage)) if (k.startsWith('mxrf:')) window.localStorage.removeItem(k); } catch { /* ignore */ }
}
