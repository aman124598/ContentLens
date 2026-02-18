// src/shared/storage.ts
// Chrome storage helpers with typed get/set wrappers

import { ExtensionSettings, DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'cl_settings';
const CACHE_KEY = 'cl_score_cache';

/** Maximum number of cached score entries */
const MAX_CACHE_SIZE = 2000;

// ─── Settings ─────────────────────────────────────────────────────────────────

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

// ─── Score cache ──────────────────────────────────────────────────────────────

/** Load the full score cache map (hash → score) */
export async function loadScoreCache(): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CACHE_KEY, (result) => {
      resolve((result[CACHE_KEY] as Record<string, number>) ?? {});
    });
  });
}

/** Persist the score cache, evicting oldest entries if over MAX_CACHE_SIZE */
export async function saveScoreCache(cache: Record<string, number>): Promise<void> {
  const keys = Object.keys(cache);
  const payload: Record<string, number> =
    keys.length > MAX_CACHE_SIZE
      ? Object.fromEntries(keys.slice(keys.length - MAX_CACHE_SIZE).map((k) => [k, cache[k]]))
      : cache;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: payload }, resolve);
  });
}

/** Look up a single hash in the persistent cache */
export async function getCachedScore(hash: string): Promise<number | null> {
  const cache = await loadScoreCache();
  return cache[hash] ?? null;
}

/** Store a single score result in the persistent cache */
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

/** Clear the entire score cache */
export async function clearScoreCache(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(CACHE_KEY, resolve);
  });
}
