// src/background/index.ts
// Background service worker — handles scoring requests, settings management, caching

import { ExtensionMessage, ExtensionSettings } from '../shared/types';
import {
  loadSettings, saveSettings, getCachedScore, setCachedScore, getCacheSize, clearScoreCache
} from '../shared/storage';
import { scoreText } from '../scoring/heuristics';
import {
  loadLicenseState, saveLicenseState, ensureInstallDate,
  computeStatus, validateLicenseKey,
} from '../shared/license';
import { signUp, signIn, signOut, getSessionUser, fetchTrialRecord } from '../shared/auth';

// ─── In-memory settings cache ─────────────────────────────────────────────────
let cachedSettings: ExtensionSettings | null = null;

async function getSettings(): Promise<ExtensionSettings> {
  if (!cachedSettings) {
    cachedSettings = await loadSettings();
  }
  return cachedSettings;
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
        // Fetch canonical trial start from Supabase (prevents multi-trial abuse)
        const trialRecord = await fetchTrialRecord();
        const status = computeStatus(state, trialRecord?.trialStart);
        sendResponse({ state, status });
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
        sendResponse({ ok: true, state, status });
        break;
      }

      // ── Auth messages ──────────────────────────────────────────────────────
      case 'AUTH_GET_SESSION': {
        const user = await getSessionUser();
        if (!user) { sendResponse({ session: null }); break; }
        const trial = await fetchTrialRecord();
        sendResponse({
          session: trial
            ? { userId: user.id, email: user.email, trialStart: trial.trialStart }
            : null,
        });
        break;
      }

      case 'AUTH_SIGN_UP': {
        const result = await signUp(message.email, message.password);
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
        break;
      }

      case 'AUTH_SIGN_OUT': {
        await signOut();
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
    // Seed defaults and record install date for trial tracking
    const settings = await getSettings();
    await saveSettings(settings);
    await ensureInstallDate();
    console.warn('[ContentLens] Extension installed — trial started.');
  }
});
