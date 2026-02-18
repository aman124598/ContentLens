// src/shared/auth.ts
// Auth helpers: sign-up / sign-in / sign-out via Supabase.
// Handles per-email trial enforcement using a `user_trials` table.
//
// Required Supabase table (run in SQL editor):
//
//   create table public.user_trials (
//     id          uuid primary key default gen_random_uuid(),
//     user_id     uuid not null references auth.users(id) on delete cascade,
//     email       text not null unique,
//     trial_start bigint not null,   -- unix ms
//     created_at  timestamptz default now()
//   );
//
//   alter table public.user_trials enable row level security;
//
//   -- Users can read/insert their own row only
//   create policy "own row" on public.user_trials
//     for all using (auth.uid() = user_id);

import { getSupabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

export interface TrialRecord {
  trialStart: number; // unix ms — canonical across all devices
}

// ─── Sign-up ─────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });

  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: 'Sign-up failed — no user returned.' };

  // Create trial record for this user (only if not already existing)
  await ensureTrialRecord(data.user.id, email);

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? email },
  };
}

// ─── Sign-in ─────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: 'Sign-in failed.' };

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? email },
  };
}

// ─── Sign-out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

// ─── Get current session user ────────────────────────────────────────────────

export async function getSessionUser(): Promise<AuthUser | null> {
  const { data } = await getSupabase().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}

// ─── Trial record helpers ─────────────────────────────────────────────────────

/**
 * Returns the canonical trial_start ms for this user from Supabase.
 * Creates the record if it doesn't exist yet (first device).
 */
export async function ensureTrialRecord(userId: string, email: string): Promise<TrialRecord> {
  const sb = getSupabase();

  // Try to fetch existing record
  const { data: existing } = await sb
    .from('user_trials')
    .select('trial_start')
    .eq('user_id', userId)
    .single();

  if (existing?.trial_start) {
    return { trialStart: existing.trial_start as number };
  }

  // No record — first time on any device. Insert with current timestamp.
  const trialStart = Date.now();
  await sb.from('user_trials').upsert({
    user_id: userId,
    email,
    trial_start: trialStart,
  });

  return { trialStart };
}

/**
 * Fetch the trial start for the currently signed-in user.
 * Returns null if not signed in or no record found.
 */
export async function fetchTrialRecord(): Promise<TrialRecord | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const { data } = await getSupabase()
    .from('user_trials')
    .select('trial_start')
    .eq('user_id', user.id)
    .single();

  if (!data?.trial_start) return null;
  return { trialStart: data.trial_start as number };
}
