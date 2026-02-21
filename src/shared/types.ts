// src/shared/types.ts
// Core shared type definitions for ContentLens

/** Score on a 1–10 scale representing AI-style likelihood */
export type AiScore = number;

/** Visual action applied to a DOM element based on score */
export type FilterMode = 'hide' | 'blur' | 'highlight' | 'badge';

/** Domain rule: whether a domain is explicitly included or excluded */
export type DomainRule = 'enabled' | 'disabled';

/** A text block extracted from the DOM, ready for scoring */
export interface TextBlock {
  /** Unique hash of the normalized text */
  hash: string;
  /** Normalized text content */
  text: string;
  /** Reference to the original DOM element */
  element: Element;
}

/** Scored result for a text block */
export interface ScoredBlock {
  hash: string;
  score: AiScore;
  /** ISO timestamp when scored */
  scoredAt: string;
}

/** User-configurable extension settings */
export interface ExtensionSettings {
  /** Master on/off toggle */
  enabled: boolean;
  /** Score threshold (1–10) — elements at or above this value are filtered */
  threshold: number;
  /** Visual action applied to filtered elements */
  mode: FilterMode;
  /** Per-domain overrides: hostname → DomainRule */
  domainRules: Record<string, DomainRule>;
  /** Minimum text length to consider for scoring */
  minTextLength: number;
  /**
   * Allowlist mode: when true the extension ONLY runs on sites explicitly
   * marked 'enabled' in domainRules.  When false (default) it runs everywhere
   * except sites explicitly marked 'disabled'.
   */
  siteAllowlistMode: boolean;
}

/** Default extension settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  threshold: 7,
  mode: 'blur',
  domainRules: {},
  minTextLength: 80,
  siteAllowlistMode: false,
};

/** License / subscription state stored in chrome.storage.sync */
export interface LicenseState {
  /** Unix ms timestamp of first install — used to calculate trial expiry */
  installDate: number;
  /** User-entered license key (null = not yet activated) */
  licenseKey: string | null;
  /** Whether the key has been validated as genuine */
  licenseValid: boolean;
  /** Email associated with the license (if returned by payment provider) */
  licenseEmail: string | null;
  /** Unix ms timestamp of last successful validation */
  lastValidated: number | null;
}

export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** Storage key for license state */
export const LICENSE_STORAGE_KEY = 'cl_license';

/** Dodo Payments checkout/payment link — replace with your actual payment link URL */
export const DODO_PAYMENT_LINK = 'https://checkout.dodopayments.com/buy/pdt_0NYkwaaZugSG9iopGS3Qz?quantity=1';

/** Computed access status derived from LicenseState */
export type LicenseStatus =
  | 'trial'        // within 7-day free trial
  | 'active'       // paid & validated
  | 'expired'      // trial over, no valid license
  | 'grace';       // validation failed but within 24h grace (offline tolerance)

export type AccessReason =
  | 'ok_trial'
  | 'ok_paid'
  | 'blocked_signed_out'
  | 'blocked_trial_expired'
  | 'blocked_unknown';

export interface AccessGate {
  allowed: boolean;
  status: LicenseStatus;
  reason: AccessReason;
  daysLeft: number;
  requiresAuth: boolean;
}

/** Auth state stored in chrome.storage.local */
export interface AuthSession {
  userId: string;
  email: string;
  /** unix ms — synced from Supabase user_trials table */
  trialStart: number;
}

/** Messages exchanged between content script / popup and background worker */
export type ExtensionMessage =
  | { type: 'SCORE_TEXT'; hash: string; text: string }
  | { type: 'SCORE_RESULT'; hash: string; score: AiScore }
  | { type: 'GET_SETTINGS' }
  | { type: 'SETTINGS_RESPONSE'; settings: ExtensionSettings }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'SETTINGS_UPDATED'; settings: ExtensionSettings }
  | { type: 'RE_EVALUATE' }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'CACHE_STATS_RESPONSE'; count: number }
  | { type: 'CLEAR_CACHE' }
  | { type: 'GET_LICENSE' }
  | { type: 'GET_ACCESS_GATE' }
  | { type: 'ACTIVATE_LICENSE'; key: string }
  | { type: 'LICENSE_STATE'; state: LicenseState; status: LicenseStatus }
  | { type: 'ACCESS_GATE_RESPONSE'; gate: AccessGate }
  | { type: 'DEACTIVATE_LICENSE' }
  // ── Auth messages ──────────────────────────────────────────────────────
  | { type: 'AUTH_SIGN_UP'; email: string; password: string }
  | { type: 'AUTH_SIGN_IN'; email: string; password: string }
  | { type: 'AUTH_SIGN_OUT' }
  | { type: 'AUTH_GET_SESSION' }
  | { type: 'AUTH_SESSION_RESPONSE'; session: AuthSession | null };

/** Feature vector produced by the heuristic engine */
export interface HeuristicFeatures {
  typeTokenRatio: number;
  repetitionScore: number;
  sentenceLengthVariance: number;
  entropyScore: number;
  phrasePatternsScore: number;
  avgSentenceLength: number;
  punctuationDensity: number;
  listLikeScore: number;
}
