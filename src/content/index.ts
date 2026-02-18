// src/content/index.ts
// Content script entry point — bootstraps ContentLens on the page

import { ExtensionSettings, ExtensionMessage, LicenseStatus, TRIAL_MS } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { scanDOM, extractBlock, setMinTextLength, REPLY_SELECTORS } from './domScanner';
import { applyFilter, removeFilter, injectBadge, reapplyMode, injectStyles, clearAllFilters, clearEverything, showPaywallBanner, removePaywallBanner } from './domModifier';
import { getCached, setCache } from './cache';
import { debounce } from '../utils/debounce';

// ─── State ────────────────────────────────────────────────────────────────────

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let observer: MutationObserver | null = null;
let initialized = false;
let lastUrl = location.href;
let licenseStatus: LicenseStatus = 'trial'; // optimistic default

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

  // Load settings from background
  settings = await fetchSettings();
  setMinTextLength(settings.minTextLength);

  if (!settings.enabled) return;

  // Check domain rules
  const hostname = window.location.hostname;
  const domainRule = settings.domainRules[hostname];
  if (domainRule === 'disabled') return;

  injectStyles();

  // ── License / trial gate ──────────────────────────────────────────────────
  licenseStatus = await fetchLicenseStatus();
  if (licenseStatus === 'expired') {
    showPaywallBanner(0);
    return; // don't start scanning
  }
  if (licenseStatus === 'trial') {
    const installDate = await fetchInstallDate();
    const daysLeft = Math.ceil(Math.max(0, TRIAL_MS - (Date.now() - installDate)) / (24 * 60 * 60 * 1000));
    showPaywallBanner(daysLeft);
  }
  if (licenseStatus === 'active') {
    removePaywallBanner();
  }

  // Twitter/X is a SPA — content loads after DOMContentLoaded.
  // Delay initial scan slightly to let the first batch of tweets render.
  const isTwitter = /^(twitter|x)\.com$/.test(hostname);
  if (isTwitter) {
    setTimeout(() => runInitialScan(), 1500);
  } else {
    await runInitialScan();
  }

  startObserver();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

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

function fetchLicenseStatus(): Promise<LicenseStatus> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_LICENSE' } as ExtensionMessage, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve('trial'); // fail open — don’t punish offline users
        return;
      }
      resolve((response as { status: LicenseStatus }).status ?? 'trial');
    });
  });
}

function fetchInstallDate(): Promise<number> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_LICENSE' } as ExtensionMessage, (response) => {
      if (chrome.runtime.lastError || !response) { resolve(Date.now()); return; }
      resolve((response as { state?: { installDate?: number } }).state?.installDate ?? Date.now());
    });
  });
}

// ─── Initial DOM Scan ─────────────────────────────────────────────────────────

async function runInitialScan() {
  const blocks = scanDOM(document);
  // Score all blocks in parallel — much faster than sequential await
  await Promise.all(blocks.map((b) => scoreAndApply(b.element, b.hash, b.text)));
}

// ─── Scoring & Applying ───────────────────────────────────────────────────────

async function scoreAndApply(el: Element, hash: string, text: string): Promise<void> {
  // 1. Check in-memory cache
  const cached = getCached(hash);
  if (cached !== null) {
    elementScores.set(el, cached);
    evaluateAndApply(el, cached);
    return;
  }

  // 2. Ask background to score (which uses persistent cache + heuristics)
  const score = await requestScore(hash, text);
  setCache(hash, score);
  elementScores.set(el, score);
  scoredHashes.add(hash);
  evaluateAndApply(el, score);
}

function requestScore(hash: string, text: string): Promise<number> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'SCORE_TEXT', hash, text } as ExtensionMessage,
      (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(1); // fail silently
          return;
        }
        resolve((response as { score: number }).score ?? 1);
      }
    );
  });
}

function evaluateAndApply(el: Element, score: number) {
  if (!settings.enabled) return;
  if (!document.contains(el)) return;

  // Always show score badge on every analyzed block
  injectBadge(el, score);

  // Additionally apply filter mode only when score meets threshold
  if (score >= settings.threshold) {
    applyFilter(el, score, settings.mode);
  } else {
    removeFilter(el);
  }
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function startObserver() {
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // Watch for text content changes inside existing tweet elements
    // (Twitter recycles DOM nodes during virtual scroll)
    characterData: true,
    characterDataOldValue: false,
  });

  // SPA navigation detection — Twitter/X changes URL without a page reload.
  const navInterval = setInterval(() => {
    if (!settings.enabled) { clearInterval(navInterval); return; }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(async () => {
        elementScores.clear();
        scoredHashes.clear();
        pendingQueue.clear();
        clearEverything();
        await runInitialScan();
      }, 1200);
    }
  }, 800);

  // Periodic sweep: catch any tweets that scrolled in but were missed.
  // Twitter’s virtual list sometimes mutates text without firing childList.
  const hostname = window.location.hostname;
  const isTwitter = /^(twitter|x)\.com$/.test(hostname);
  if (isTwitter) {
    setInterval(() => {
      if (!settings.enabled) return;
      sweepVisibleTweets();
    }, 1200);
  }
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
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
  } catch { /* ignore */ }
}

// Reduce debounce to 80ms — Twitter adds tweets very fast during scroll
const handleMutations = debounce((_mutations: MutationRecord[]) => {
  // On Twitter: just sweep all visible tweetText elements.
  // Much more reliable than trying to track individual mutation nodes,
  // because Twitter recycles DOM nodes and batches many mutations at once.
  const hostname = window.location.hostname;
  const isTwitterLike = /^(twitter|x)\.com$/.test(hostname) ||
    hostname === 'linkedin.com' || hostname === 'www.linkedin.com';

  if (isTwitterLike) {
    sweepVisibleTweets();
    return;
  }

  // Non-SPA: process added nodes normally
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
  } catch { /* ignore */ }

  try {
    root.querySelectorAll(REPLY_SELECTORS).forEach((child) => {
      if (!set.has(child)) { out.push(child); set.add(child); }
    });
  } catch { /* ignore */ }
}

async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (pendingQueue.size > 0) {
    // Drain current batch — score all of them in parallel
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
      clearEverything();
      stopObserver();
      sendResponse({ ok: true });
      return true;
    }

    if (!prev.enabled && settings.enabled) {
      // Re-scan from scratch
      elementScores.clear();
      scoredHashes.clear();
      pendingQueue.clear();
      injectStyles();
      runInitialScan().then(() => startObserver());
      sendResponse({ ok: true });
      return true;
    }

    // Threshold or mode changed → re-evaluate existing scored elements
    reapplyMode(elementScores, settings.threshold, settings.mode);

    // If domain rule changed check current domain
    const hostname = window.location.hostname;
    if (settings.domainRules[hostname] === 'disabled') {
      clearAllFilters();
      stopObserver();
    }

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RE_EVALUATE') {
    elementScores.clear();
    scoredHashes.clear();
    pendingQueue.clear();
    clearEverything();
    runInitialScan();
    sendResponse({ ok: true });
    return true;
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
