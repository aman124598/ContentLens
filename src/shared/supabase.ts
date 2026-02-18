// src/shared/supabase.ts
// Supabase client configured for Chrome extension context.
//
// Chrome extensions have NO localStorage in service workers, so we use a
// custom storage adapter backed by chrome.storage.local instead.
//
// ⚠️  Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project values from
//     https://supabase.com/dashboard → Project Settings → API

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Credentials loaded from .env at build time via Vite ─────────────────────
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cl_supabase_session';

/**
 * Custom storage adapter that persists Supabase auth tokens in
 * chrome.storage.local instead of localStorage (unavailable in sw context).
 */
const chromeStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] ?? null);
      });
    }),

  setItem: (key: string, value: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    }),

  removeItem: (key: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    }),
};

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: chromeStorageAdapter,
        storageKey: STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // must be false for extensions
      },
    });
  }
  return _client;
}
