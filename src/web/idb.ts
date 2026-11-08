/** Armazenamento chave-valor no IndexedDB do navegador (dados ficam só neste aparelho). */
const DB = 'numero-magico';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => { const r = d.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result as T | undefined); r.onerror = () => reject(r.error); });
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, key); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); });
}
