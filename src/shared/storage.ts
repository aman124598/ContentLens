// src/shared/storage.ts
// Chrome storage helpers with typed get/set wrappers

import { ExtensionSettings, DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'cl_settings';
const CACHE_KEY = 'cl_score_cache';

/** Maximum number of cached score entries */
const MAX_CACHE_SIZE = 2000;

/** Load settings from chrome.storage.local, merging with defaults */
export async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

/** Persist settings to chrome.storage.local */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}

/** Load the score cache map (hash → score) */
export async function loadScoreCache(): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CACHE_KEY, (result) => {
      resolve((result[CACHE_KEY] as Record<string, number>) ?? {});
    });
  });
}

/** Save the score cache map */
export async function saveScoreCache(cache: Record<string, number>): Promise<void> {
  // Evict oldest entries if over limit (simple LRU approximation: drop first keys)
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_SIZE) {
    const trimmed: Record<string, number> = {};
    keys.slice(keys.length - MAX_CACHE_SIZE).forEach((k) => {
      trimmed[k] = cache[k];
    });
    return new Promise((resolve) => {
      chrome.storage.local.set({ [CACHE_KEY]: trimmed }, resolve);
    });
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, resolve);
  });
}

/** Look up a single hash in the cache */
export async function getCachedScore(hash: string): Promise<number | null> {
  const cache = await loadScoreCache();
  return cache[hash] ?? null;
}

/** Store a single score result in the cache */
export async function setCachedScore(hash: string, score: number): Promise<void> {
  const cache = await loadScoreCache();
  cache[hash] = score;
  await saveScoreCache(cache);
}

/** Return the number of cached entries */
export async function getCacheSize(): Promise<number> {
  const cache = await loadScoreCache();
  return Object.keys(cache).length;
}

/** Clear the score cache */
export async function clearScoreCache(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(CACHE_KEY, resolve);
  });
}
