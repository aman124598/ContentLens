// src/content/domScanner.ts
// DOM traversal and text block extraction

import { TextBlock } from '../shared/types';
import { normalizeText, hashText } from '../utils/hash';

/** Tags excluded from scanning */
const EXCLUDED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'TEMPLATE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'HEAD',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'FORM',
  'NAV', 'HEADER', 'FOOTER', 'CODE', 'PRE',
]);

/** Roles that suggest navigation/UI rather than content */
const EXCLUDED_ROLES = new Set([
  'navigation', 'banner', 'complementary', 'contentinfo',
  'menubar', 'menu', 'menuitem', 'toolbar', 'status',
  'search', 'form',
]);

/** CSS classes/IDs that typically indicate UI controls (heuristic) */
const UI_PATTERNS = /\b(nav|menu|btn|button|toolbar|sidebar|breadcrumb|pagination|header|footer|widget|ad-|advertisement)\b/i;

/**
 * Targeted selectors for known reply/comment containers per site.
 * Elements matched here are trusted — isScorable() is NOT applied to them.
 */
export const REPLY_SELECTORS = [
  // ── Twitter / X ──────────────────────────────────────────────────────────
  '[data-testid="tweetText"]',
  // ── Reddit ────────────────────────────────────────────────────────────────
  'shreddit-comment [slot="comment"]',
  '.usertext-body .md',
  '[id^="thing_t1_"] .md',
  // ── Hacker News ───────────────────────────────────────────────────────────
  '.commtext',
  // ── Stack Overflow / Stack Exchange ─────────────────────────────────────
  '.s-prose',
  '.post-text',
  // ── YouTube ───────────────────────────────────────────────────────────────
  '#content-text.ytd-comment-renderer',
  // ── LinkedIn ──────────────────────────────────────────────────────────────
  '.comments-comment-item__main-content',
  '.update-components-text',
  // ── Medium / Substack ────────────────────────────────────────────────────
  '.pw-post-body-paragraph',
].join(', ');

/**
 * Hostnames where Pass 2 (generic tree walk) is disabled.
 * These are SPAs with complex DOMs where only targeted selectors are safe.
 */
const PASS1_ONLY_HOSTS = new Set([
  'twitter.com', 'x.com',
  'linkedin.com', 'www.linkedin.com',
]);

/**
 * Twitter data-testid values that are UI elements, NOT content.
 * Prevents stats bars, trending topics, and other chrome from being scored.
 */
const TWITTER_EXCLUDED_TESTIDS = new Set([
  'app-text-transition-container', // view count / stats
  'analyticsButton',
  'tweet-stats',
  'tweetEngagements',
  'tweetButtonInline',
  'reply',
  'like',
  'retweet',
  'UserName',
  'UserScreenName',
  'User-Name',
  'userActions',
  'placementTracking',
  'trend',
  'trendMetadata',
  'TypeaheadUser',
  'TypeaheadTopic',
  'cellInnerDiv', // top-level tweet cell wrapper
]);

// Twitter tweets are often 30–80 chars — use a lower hard floor for targeted selectors
const TARGETED_MIN_LENGTH = 25;
let minTextLength = 80;

export function setMinTextLength(len: number) {
  minTextLength = len;
}

/**
 * Check if an element is a reasonable content candidate.
 * @param trusted - if true (Pass 1 targeted element), skip UI_PATTERNS and visibility checks
 */
function isContentCandidate(el: Element, trusted = false): boolean {
  if (EXCLUDED_TAGS.has(el.tagName)) return false;

  const role = el.getAttribute('role');
  if (role && EXCLUDED_ROLES.has(role)) return false;

  // Block known Twitter UI data-testid values regardless of trusted flag
  const testId = el.getAttribute('data-testid');
  if (testId && TWITTER_EXCLUDED_TESTIDS.has(testId)) return false;

  // Skip UI patterns check for trusted (targeted selector) elements
  if (!trusted) {
    const id = el.id ?? '';
    const className = typeof el.className === 'string' ? el.className : '';
    if (UI_PATTERNS.test(id) || UI_PATTERNS.test(className)) return false;

    // Skip hidden elements (but only for untrusted — targeted elements like
    // tweetText can briefly have display:none during render)
    const htmlEl = el as HTMLElement;
    if (htmlEl.hidden) return false;
    if (htmlEl.style?.display === 'none' || htmlEl.style?.visibility === 'hidden') return false;
  }

  return true;
}

/**
 * Determine if an element is a self-contained leaf-level text block worth scoring.
 * Rules:
 *  - Total text >= minTextLength
 *  - No single direct child element holds >= 70% of the total text
 *    (prevents scoring wrapper divs whose content lives deeper)
 *  - Has some own direct text OR is a known inline text container (span/p/div with no block children)
 */
function isScorable(el: Element): boolean {
  const totalText = (el.textContent ?? '').trim();
  if (totalText.length < minTextLength) return false;

  // Block-level children — if any single one dominates, skip this element
  const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN',
    'LI', 'UL', 'OL', 'TABLE', 'TR', 'TD', 'TH', 'DETAILS', 'SUMMARY']);

  for (const child of el.children) {
    const childLen = (child.textContent ?? '').trim().length;
    // If any child has ≥ 70% of the text, this element is a container — skip it
    if (childLen >= totalText.length * 0.7) return false;
    // Also skip if child is a major block element with substantial text
    if (blockTags.has(child.tagName) && childLen > 100) return false;
  }

  return true;
}

/**
 * Walk the DOM and collect all candidate text blocks.
 * Strategy:
 *  Pass 1 — targeted site-specific selectors (high confidence, small set)
 *  Pass 2 — full tree walk looking for leaf elements (picks up everything else)
 * Both passes deduplicate by hash.
 */
export function scanDOM(root: Document | Element = document): TextBlock[] {
  const results: TextBlock[] = [];
  const seenHashes = new Set<string>();
  const seenElements = new Set<Element>();

  const bodyRoot: Element =
    root instanceof Document ? (root.body ?? root.documentElement) : root;

  // Detect if we're on a SPA host where Pass 2 is unsafe
  const hostname = window.location.hostname;
  const pass1Only = PASS1_ONLY_HOSTS.has(hostname);

  // ── Pass 1: targeted reply/comment selectors (bypass isScorable) ──────────
  // These selectors point directly at known content nodes, so we trust them
  // and use a lower minimum length (catches tweets, short comments, etc.)
  try {
    const targeted = bodyRoot.querySelectorAll(REPLY_SELECTORS);
    for (const el of targeted) {
      if (!isContentCandidate(el, true /* trusted */)) continue;
      const raw = el.textContent ?? '';
      const normalized = normalizeText(raw);
      if (normalized.length >= TARGETED_MIN_LENGTH) {
        const hash = hashText(normalized);
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          seenElements.add(el);
          results.push({ hash, text: normalized, element: el });
        }
      }
    }
  } catch {
    // Invalid selector on some pages — ignore
  }

  // Pass 2: full tree walk (skipped on SPA hosts like Twitter/LinkedIn)
  if (pass1Only) return results;
  const walker = document.createTreeWalker(
    bodyRoot,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node) {
        const el = node as Element;
        if (!isContentCandidate(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node: Node | null = walker.currentNode;
  while (node) {
    const el = node as Element;
    if (!seenElements.has(el) && isScorable(el)) {
      const raw = el.textContent ?? '';
      const normalized = normalizeText(raw);
      if (normalized.length >= minTextLength) {
        const hash = hashText(normalized);
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          results.push({ hash, text: normalized, element: el });
        }
      }
    }
    node = walker.nextNode();
  }

  return results;
}

/**
 * Extract a TextBlock from a single element (used by MutationObserver).
 * For elements matching REPLY_SELECTORS, bypass isScorable() and use the
 * lower TARGETED_MIN_LENGTH floor so tweets and short replies are caught.
 */
export function extractBlock(el: Element): TextBlock | null {
  // Check if this element matches any targeted selector FIRST
  // so trusted elements bypass the isContentCandidate visibility checks
  let isTargeted = false;
  try {
    isTargeted = el.matches(REPLY_SELECTORS);
  } catch { /* ignore */ }

  if (!isContentCandidate(el, isTargeted)) return null;

  const raw = el.textContent ?? '';
  const normalized = normalizeText(raw);

  const floor = isTargeted ? TARGETED_MIN_LENGTH : minTextLength;
  if (normalized.length < floor) return null;
  if (!isTargeted && !isScorable(el)) return null;

  const hash = hashText(normalized);
  return { hash, text: normalized, element: el };
}
