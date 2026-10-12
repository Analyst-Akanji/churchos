import { db } from './db';

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try { return (await (await db()).get('cache', key))?.value as T | undefined; } catch { return undefined; }
}
export async function cacheSet(key: string, value: unknown): Promise<void> {
  try { await (await db()).put('cache', { key, value, savedAt: Date.now() }); } catch { /* storage full or blocked: ignore */ }
}

/** Try the network; remember the result; if the network fails, fall back to the last good copy. */
export async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    void cacheSet(key, fresh);
    return fresh;
  } catch (err) {
    const cached = await cacheGet<T>(key);
    if (cached !== undefined) return cached;
    throw err;
  }
}
