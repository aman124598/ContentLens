// src/background/index.ts
// Background service worker — handles scoring requests, settings management, caching

import { AccessGate, ExtensionMessage, ExtensionSettings } from '../shared/types';
import {
  loadSettings, saveSettings, getCachedScore, setCachedScore, getCacheSize, clearScoreCache
} from '../shared/storage';
import { scoreText } from '../scoring/heuristics';
import {
  loadLicenseState, saveLicenseState, ensureInstallDate,
  computeStatus, computeTrialDaysLeft, validateLicenseKey,
} from '../shared/license';
import { ensureTrialRecord, signUp, signIn, signOut, getSessionUser, fetchTrialRecord } from '../shared/auth';

// ─── In-memory settings cache ─────────────────────────────────────────────────
let cachedSettings: ExtensionSettings | null = null;

async function getSettings(): Promise<ExtensionSettings> {
  if (!cachedSettings) {
    cachedSettings = await loadSettings();
  }
  return cachedSettings;
}

async function resolveAccessGate(): Promise<AccessGate> {
  try {
    const state = await loadLicenseState();
    const user = await getSessionUser();
    if (!user) {
      return {
        allowed: false,
        status: 'expired',
        reason: 'blocked_signed_out',
        daysLeft: 0,
        requiresAuth: true,
      };
    }

    let trialRecord = await fetchTrialRecord();
    if (!trialRecord) {
      trialRecord = await ensureTrialRecord(user.id, user.email);
    }

    const status = computeStatus(state, trialRecord.trialStart);
    if (status === 'active' || status === 'grace') {
      return {
        allowed: true,
        status,
        reason: 'ok_paid',
        daysLeft: computeTrialDaysLeft(trialRecord.trialStart),
        requiresAuth: false,
      };
    }

    if (status === 'trial') {
      return {
        allowed: true,
        status,
        reason: 'ok_trial',
        daysLeft: computeTrialDaysLeft(trialRecord.trialStart),
        requiresAuth: false,
      };
    }

    return {
      allowed: false,
      status: 'expired',
      reason: 'blocked_trial_expired',
      daysLeft: 0,
      requiresAuth: false,
    };
  } catch (err) {
    console.warn('[ContentLens BG] resolveAccessGate failed:', err);
    return {
      allowed: false,
      status: 'expired',
      reason: 'blocked_unknown',
      daysLeft: 0,
      requiresAuth: false,
    };
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // keep sendResponse alive for async handlers
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: unknown) => void
) {
  try {
    switch (message.type) {
      case 'SCORE_TEXT': {
        const gate = await resolveAccessGate();
        if (!gate.allowed) {
          sendResponse({ error: 'ACCESS_BLOCKED', gate });
          return;
        }

        const { hash, text } = message;

        // 1. Check persistent cache
        const cached = await getCachedScore(hash);
        if (cached !== null) {
          sendResponse({ score: cached });
          return;
        }

        // 2. Run local heuristic scorer
        const score = scoreText(text);

        // 3. Persist to cache
        await setCachedScore(hash, score);

        sendResponse({ score });
        break;
      }

      case 'GET_SETTINGS': {
        const settings = await getSettings();
        sendResponse({ settings });
        break;
      }

      case 'UPDATE_SETTINGS': {
        const current = await getSettings();
        const updated: ExtensionSettings = { ...current, ...message.settings };
        await saveSettings(updated);
        cachedSettings = updated;

        // Broadcast to all content scripts in active tabs
        broadcastToContentScripts({ type: 'SETTINGS_UPDATED', settings: updated });

        sendResponse({ settings: updated });
        break;
      }

      case 'GET_CACHE_STATS': {
        const count = await getCacheSize();
        sendResponse({ count });
        break;
      }

      case 'CLEAR_CACHE': {
        await clearScoreCache();
        sendResponse({ ok: true });
        break;
      }

      // ── License messages ────────────────────────────────────────────────────────────
      case 'GET_LICENSE': {
        const state = await loadLicenseState();
        const gate = await resolveAccessGate();
        sendResponse({ state, status: gate.status, gate });
        break;
      }

      case 'GET_ACCESS_GATE': {
        const gate = await resolveAccessGate();
        sendResponse({ gate });
        break;
      }

      case 'ACTIVATE_LICENSE': {
        const result = await validateLicenseKey(message.key.trim());
        if (result.valid) {
          const state = await loadLicenseState();
          state.licenseKey = message.key.trim();
          state.licenseValid = true;
          state.licenseEmail = result.email ?? null;
          state.lastValidated = Date.now();
          await saveLicenseState(state);
          // Use Supabase trial record so status is accurate
          const trialRec = await fetchTrialRecord();
          const status = computeStatus(state, trialRec?.trialStart);
          broadcastToContentScripts({ type: 'RE_EVALUATE' });
          sendResponse({ ok: true, state, status });
        } else {
          sendResponse({ ok: false, error: result.error ?? 'Validation failed' });
        }
        break;
      }

      case 'DEACTIVATE_LICENSE': {
        const state = await loadLicenseState();
        state.licenseKey = null;
        state.licenseValid = false;
        state.licenseEmail = null;
        state.lastValidated = null;
        await saveLicenseState(state);
        const trialRecord2 = await fetchTrialRecord();
        const status = computeStatus(state, trialRecord2?.trialStart);
        broadcastToContentScripts({ type: 'RE_EVALUATE' });
        sendResponse({ ok: true, state, status });
        break;
      }

      // ── Auth messages ──────────────────────────────────────────────────────
      case 'AUTH_GET_SESSION': {
        const user = await getSessionUser();
        if (!user) { sendResponse({ session: null }); break; }
        let trial = await fetchTrialRecord();
        if (!trial) {
          trial = await ensureTrialRecord(user.id, user.email);
        }
        sendResponse({
          session: { userId: user.id, email: user.email, trialStart: trial.trialStart },
        });
        break;
      }

      case 'AUTH_SIGN_UP': {
        const result = await signUp(message.email, message.password);
        if (!result.ok || !result.user) {
          sendResponse({ ok: false, error: result.error });
          break;
        }
        sendResponse({ ok: true, session: null });
        break;
      }

      case 'AUTH_SIGN_IN': {
        const result = await signIn(message.email, message.password);
        if (!result.ok || !result.user) {
          sendResponse({ ok: false, error: result.error });
          break;
        }
        const trialRec = await fetchTrialRecord();
        sendResponse({
          ok: true,
          session: {
            userId: result.user.id,
            email: result.user.email,
            trialStart: trialRec?.trialStart ?? Date.now(),
          },
        });
        broadcastToContentScripts({ type: 'RE_EVALUATE' });
        break;
      }

      case 'AUTH_SIGN_OUT': {
        await signOut();
        broadcastToContentScripts({ type: 'RE_EVALUATE' });
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (err) {
    console.error('[ContentLens BG] Error handling message:', err);
    sendResponse({ error: String(err) });
  }
}

// ─── Broadcast helper ─────────────────────────────────────────────────────────

async function broadcastToContentScripts(message: ExtensionMessage) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== undefined && tab.id >= 0) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab may not have content script — ignore
        });
      }
    }
  } catch (err) {
    console.warn('[ContentLens BG] Broadcast failed:', err);
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Seed defaults and record install metadata.
    const settings = await getSettings();
    await saveSettings(settings);
    await ensureInstallDate();
    console.warn('[ContentLens] Extension installed.');
  }
});
