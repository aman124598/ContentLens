// src/content/index.ts
// Content script entry point — bootstraps ContentLens on the page

import { AccessGate, ExtensionMessage, ExtensionSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { scanDOM, extractBlock, setMinTextLength, REPLY_SELECTORS } from './domScanner';
import {
  applyFilter, removeFilter, injectBadge, reapplyMode, injectStyles,
  clearEverything, showPaywallBanner, removePaywallBanner, showAccessBlockedBanner,
} from './domModifier';
import { getCached, setCache } from './cache';
import { debounce } from '../utils/debounce';

// ─── State ────────────────────────────────────────────────────────────────────

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let observer: MutationObserver | null = null;
let initialized = false;
let lastUrl = location.href;
let accessGate: AccessGate | null = null;
let navIntervalId: number | null = null;
let sweepIntervalId: number | null = null;

/** Map from DOM element → its last known score (for re-evaluation) */
const elementScores = new Map<Element, number>();

/** Dedup set — hashes already scored or currently in queue */
const scoredHashes = new Set<string>();

/** Queue of pending elements to score */
const pendingQueue: Set<Element> = new Set();
let processingQueue = false;

// ─── Initialization ───────────────────────────────────────────────────────────

async function init() {
  if (initialized) return;
  initialized = true;

  settings = await fetchSettings();
  setMinTextLength(settings.minTextLength);

  if (!settings.enabled) return;

  if (!isCurrentSiteEligible()) return;

  injectStyles();

  const gate = await fetchAccessGate();
  if (!applyAccessGate(gate)) return;

  const hostname = window.location.hostname;
  const isTwitter = /^(twitter|x)\.com$/.test(hostname);
  if (isTwitter) {
    setTimeout(() => runInitialScan(), 1500);
  } else {
    await runInitialScan();
  }

  startObserver();
}

// ─── Settings / Access Gate ──────────────────────────────────────────────────

function fetchSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      resolve((response as { settings: ExtensionSettings }).settings ?? DEFAULT_SETTINGS);
    });
  });
}

function fetchAccessGate(): Promise<AccessGate> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ACCESS_GATE' } as ExtensionMessage, (response) => {
      if (chrome.runtime.lastError || !response?.gate) {
        resolve({
          allowed: false,
          status: 'expired',
          reason: 'blocked_unknown',
          daysLeft: 0,
          requiresAuth: false,
        });
        return;
      }
      resolve((response as { gate: AccessGate }).gate);
    });
  });
}

function applyAccessGate(gate: AccessGate): boolean {
  accessGate = gate;

  removePaywallBanner();
  if (!gate.allowed) {
    clearRuntimeState(true);
    if (gate.reason === 'blocked_signed_out') {
      showAccessBlockedBanner('blocked_signed_out', gate.daysLeft);
    } else if (gate.reason === 'blocked_trial_expired') {
      showAccessBlockedBanner('blocked_trial_expired', 0);
    } else {
      showAccessBlockedBanner('blocked_unknown', 0);
    }
    return false;
  }

  if (gate.reason === 'ok_trial') {
    showPaywallBanner(gate.daysLeft);
  }

  return true;
}

async function reevaluateAccessAndRescan() {
  if (!isCurrentSiteEligible()) {
    removePaywallBanner();
    clearRuntimeState(true);
    return;
  }
  const gate = await fetchAccessGate();
  if (!applyAccessGate(gate)) return;
  clearRuntimeState(false);
  await runInitialScan();
  if (!observer) startObserver();
}

// ─── Initial DOM Scan ─────────────────────────────────────────────────────────

async function runInitialScan() {
  if (!accessGate?.allowed || !settings.enabled || !isCurrentSiteEligible()) return;
  const blocks = scanDOM(document);
  await Promise.all(blocks.map((b) => scoreAndApply(b.element, b.hash, b.text)));
}

// ─── Scoring & Applying ───────────────────────────────────────────────────────

async function scoreAndApply(el: Element, hash: string, text: string): Promise<void> {
  if (!accessGate?.allowed || !isCurrentSiteEligible()) return;

  const cached = getCached(hash);
  if (cached !== null) {
    elementScores.set(el, cached);
    evaluateAndApply(el, cached);
    return;
  }

  const score = await requestScore(hash, text);
  if (score === null) return;

  setCache(hash, score);
  elementScores.set(el, score);
  scoredHashes.add(hash);
  evaluateAndApply(el, score);
}

function requestScore(hash: string, text: string): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'SCORE_TEXT', hash, text } as ExtensionMessage,
      (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(1);
          return;
        }
        const blocked = response as { error?: string; gate?: AccessGate };
        if (blocked.error === 'ACCESS_BLOCKED') {
          if (blocked.gate) {
            applyAccessGate(blocked.gate);
          } else {
            applyAccessGate({
              allowed: false,
              status: 'expired',
              reason: 'blocked_unknown',
              daysLeft: 0,
              requiresAuth: false,
            });
          }
          resolve(null);
          return;
        }
        resolve((response as { score: number }).score ?? 1);
      }
    );
  });
}

function evaluateAndApply(el: Element, score: number) {
  if (!settings.enabled || !accessGate?.allowed || !isCurrentSiteEligible()) return;
  if (!document.contains(el)) return;

  injectBadge(el, score);
  if (score >= settings.threshold) {
    applyFilter(el, score, settings.mode);
  } else {
    removeFilter(el);
  }
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function startObserver() {
  stopObserver();
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: false,
  });

  navIntervalId = window.setInterval(() => {
    if (!settings.enabled || !accessGate?.allowed || !isCurrentSiteEligible()) return;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        reevaluateAccessAndRescan();
      }, 1200);
    }
  }, 800);

  const hostname = window.location.hostname;
  const isTwitter = /^(twitter|x)\.com$/.test(hostname);
  if (isTwitter) {
    sweepIntervalId = window.setInterval(() => {
      if (!settings.enabled || !accessGate?.allowed || !isCurrentSiteEligible()) return;
      sweepVisibleTweets();
    }, 1200);
  }
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
  if (navIntervalId !== null) {
    clearInterval(navIntervalId);
    navIntervalId = null;
  }
  if (sweepIntervalId !== null) {
    clearInterval(sweepIntervalId);
    sweepIntervalId = null;
  }
}

function clearRuntimeState(stopWatching: boolean) {
  elementScores.clear();
  scoredHashes.clear();
  pendingQueue.clear();
  processingQueue = false;
  clearEverything();
  if (stopWatching) stopObserver();
}

/**
 * Sweep all currently visible [data-testid="tweetText"] elements and enqueue
 * any that don’t yet have a badge. Called periodically on Twitter.
 */
function sweepVisibleTweets() {
  try {
    document.querySelectorAll('[data-testid="tweetText"]').forEach((el) => {
      if (!el.querySelector('.cl-badge-wrap')) {
        pendingQueue.add(el);
      }
    });
    if (pendingQueue.size > 0) processQueue();
  } catch {
    // ignore
  }
}

const handleMutations = debounce((_mutations: MutationRecord[]) => {
  if (!accessGate?.allowed || !settings.enabled || !isCurrentSiteEligible()) return;

  const hostname = window.location.hostname;
  const isTwitterLike = /^(twitter|x)\.com$/.test(hostname) ||
    hostname === 'linkedin.com' || hostname === 'www.linkedin.com';

  if (isTwitterLike) {
    sweepVisibleTweets();
    return;
  }

  const newElements: Element[] = [];
  for (const mutation of _mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      collectCandidates(node as Element, newElements);
    }
  }
  newElements.forEach((el) => pendingQueue.add(el));
  processQueue();
}, 80);

function collectCandidates(root: Element, out: Element[]) {
  const set = new Set(out);

  try {
    if (root.matches(REPLY_SELECTORS) && !set.has(root)) out.push(root);
  } catch {
    // ignore
  }

  try {
    root.querySelectorAll(REPLY_SELECTORS).forEach((child) => {
      if (!set.has(child)) {
        out.push(child);
        set.add(child);
      }
    });
  } catch {
    // ignore
  }
}

async function processQueue() {
  if (processingQueue || !accessGate?.allowed || !isCurrentSiteEligible()) return;
  processingQueue = true;

  while (pendingQueue.size > 0) {
    if (!accessGate?.allowed || !isCurrentSiteEligible()) break;
    const batch = Array.from(pendingQueue);
    pendingQueue.clear();

    await Promise.all(
      batch
        .filter((el) => document.contains(el))
        .map((el) => {
          const block = extractBlock(el);
          if (!block) return Promise.resolve();
          return scoreAndApply(block.element, block.hash, block.text);
        })
    );
  }

  processingQueue = false;
}

// ─── Message Listener (settings updates from popup/options) ──────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    const prev = settings;
    settings = message.settings;
    setMinTextLength(settings.minTextLength);

    if (!settings.enabled) {
      clearRuntimeState(true);
      sendResponse({ ok: true });
      return true;
    }

    if (!isCurrentSiteEligible()) {
      clearRuntimeState(true);
      sendResponse({ ok: true });
      return true;
    }

    if (!prev.enabled && settings.enabled) {
      injectStyles();
      reevaluateAccessAndRescan().then(() => sendResponse({ ok: true }));
      return true;
    }

    reapplyMode(elementScores, settings.threshold, settings.mode);
    if (!observer) startObserver();

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RE_EVALUATE') {
    reevaluateAccessAndRescan().then(() => sendResponse({ ok: true }));
    return true;
  }
});

function hostMatchesRule(hostname: string, ruleHost: string): boolean {
  return hostname === ruleHost || hostname.endsWith(`.${ruleHost}`);
}

function isCurrentSiteEligible(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  const domainRules = settings.domainRules ?? {};

  if (settings.siteAllowlistMode) {
    return Object.entries(domainRules).some(
      ([ruleHost, rule]) => rule === 'enabled' && hostMatchesRule(hostname, ruleHost.toLowerCase())
    );
  }

  const isDisabled = Object.entries(domainRules).some(
    ([ruleHost, rule]) => rule === 'disabled' && hostMatchesRule(hostname, ruleHost.toLowerCase())
  );
  return !isDisabled;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
