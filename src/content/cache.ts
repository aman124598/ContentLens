// src/content/cache.ts
// In-memory score cache for content script session (avoids repeated bg messages)

interface CacheEntry {
  score: number;
  ts: number;
}

const MAX_ENTRIES = 500;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

const memCache = new Map<string, CacheEntry>();

export function getCached(hash: string): number | null {
  const entry = memCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    memCache.delete(hash);
    return null;
  }
  return entry.score;
}

export function setCache(hash: string, score: number) {
  if (memCache.size >= MAX_ENTRIES) {
    // Evict oldest entry
    const oldestKey = memCache.keys().next().value;
    if (oldestKey) memCache.delete(oldestKey);
  }
  memCache.set(hash, { score, ts: Date.now() });
}

export function clearMemCache() {
  memCache.clear();
}
