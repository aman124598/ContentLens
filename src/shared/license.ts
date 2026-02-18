// src/shared/license.ts
// License validation logic: trial tracking + Lemon Squeezy key verification.
// All validation runs in the background service worker (has network access).

import { LicenseState, LicenseStatus, LICENSE_STORAGE_KEY, TRIAL_MS } from './types';

// ─── Lemon Squeezy API ────────────────────────────────────────────────────────
// Replace YOUR_LS_STORE_ID with your actual store ID from lemonsqueezy.com
const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export async function loadLicenseState(): Promise<LicenseState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(LICENSE_STORAGE_KEY, (data) => {
      const stored = data[LICENSE_STORAGE_KEY] as Partial<LicenseState> | undefined;
      resolve({
        installDate: stored?.installDate ?? Date.now(),
        licenseKey: stored?.licenseKey ?? null,
        licenseValid: stored?.licenseValid ?? false,
        licenseEmail: stored?.licenseEmail ?? null,
        lastValidated: stored?.lastValidated ?? null,
      });
    });
  });
}

export async function saveLicenseState(state: LicenseState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [LICENSE_STORAGE_KEY]: state }, resolve);
  });
}

/** Record install date on first run (only writes if not already set). */
export async function ensureInstallDate(): Promise<LicenseState> {
  const state = await loadLicenseState();
  if (!state.installDate) {
    state.installDate = Date.now();
    await saveLicenseState(state);
  }
  return state;
}

// ─── Status computation ───────────────────────────────────────────────────────

export function computeStatus(state: LicenseState): LicenseStatus {
  // 1. Valid paid license
  if (state.licenseValid) {
    // Offline grace: if validation is stale by > 48 h but key exists, allow grace
    const staleMs = state.lastValidated ? Date.now() - state.lastValidated : Infinity;
    if (staleMs < 48 * 60 * 60 * 1000) return 'active';
    return 'grace';
  }

  // 2. Within free trial
  const elapsed = Date.now() - (state.installDate ?? Date.now());
  if (elapsed < TRIAL_MS) return 'trial';

  // 3. Trial expired, no license
  return 'expired';
}

/** Returns true if user is allowed to use core features. */
export function isAccessAllowed(status: LicenseStatus): boolean {
  return status === 'trial' || status === 'active' || status === 'grace';
}

/** Human-readable trial countdown string, e.g. "5 days left" */
export function trialCountdown(state: LicenseState): string {
  const elapsed = Date.now() - (state.installDate ?? Date.now());
  const remaining = Math.max(0, TRIAL_MS - elapsed);
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} left`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} left`;
  return 'less than 1 hour left';
}

// ─── License key validation via Lemon Squeezy ────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  email?: string;
  error?: string;
}

export async function validateLicenseKey(key: string): Promise<ValidationResult> {
  try {
    const res = await fetch(LS_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: key }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { valid: false, error: (body?.error as string) ?? `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      valid: boolean;
      license_key?: { key: string; status: string };
      meta?: { store_id: number; order_id: number; customer_email?: string };
      error?: string;
    };

    if (!data.valid) {
      return { valid: false, error: data.error ?? 'Invalid license key' };
    }

    return {
      valid: true,
      email: data.meta?.customer_email,
    };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}
