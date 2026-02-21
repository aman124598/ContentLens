// src/content/domModifier.ts
// Apply/remove visual modifications on DOM elements based on score and mode.

import { AccessReason, FilterMode, DODO_PAYMENT_LINK } from '../shared/types';

const ATTR_SCORE = 'data-cl-score';
const ATTR_MODE = 'data-cl-mode';
const CLASS_MODIFIED = 'cl-modified';
const CLASS_BADGE_WRAP = 'cl-badge-wrap';

// Inject global styles once
let stylesInjected = false;

export function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'cl-styles';
  style.textContent = `
    /* ContentLens – visual modifications */

    /* ── Badge wrap: inline element appended after content ── */
    /* Using inline (NOT absolute) so Twitter's overflow:hidden can't clip it */
    .cl-badge-wrap {
      display: inline !important;
      position: static !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    }

    .cl-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 3px !important;
      font-size: 10px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      font-weight: 700 !important;
      border-radius: 4px !important;
      padding: 2px 5px !important;
      white-space: nowrap !important;
      cursor: default !important;
      user-select: none !important;
      line-height: 1.5 !important;
      letter-spacing: 0.01em !important;
      pointer-events: auto !important;
      text-decoration: none !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
      vertical-align: middle !important;
      margin-left: 6px !important;
    }
    /* low (1–3): green */
    .cl-badge[data-level="low"] {
      background: rgba(34, 197, 94, 0.92) !important;
      border: 1px solid rgba(21, 128, 61, 0.5) !important;
      color: #fff !important;
    }
    /* medium (4–6): amber */
    .cl-badge[data-level="medium"] {
      background: rgba(245, 158, 11, 0.92) !important;
      border: 1px solid rgba(146, 64, 14, 0.4) !important;
      color: #fff !important;
    }
    /* high (7–8): red */
    .cl-badge[data-level="high"] {
      background: rgba(239, 68, 68, 0.92) !important;
      border: 1px solid rgba(185, 28, 28, 0.5) !important;
      color: #fff !important;
    }
    /* very-high (9–10): deep red */
    .cl-badge[data-level="very-high"] {
      background: rgba(127, 29, 29, 0.95) !important;
      border: 1px solid rgba(127, 29, 29, 0.7) !important;
      color: #fff !important;
    }

    /* ── Filter modes ── */
    .cl-modified[data-cl-mode="hide"] {
      display: none !important;
    }

    .cl-modified[data-cl-mode="blur"] > *:not(.cl-badge-wrap),
    .cl-modified[data-cl-mode="blur"] > *:not(.cl-badge-wrap) > * {
      filter: blur(5px) !important;
      transition: filter 0.2s ease !important;
    }
    .cl-modified[data-cl-mode="blur"]:hover > *:not(.cl-badge-wrap),
    .cl-modified[data-cl-mode="blur"]:hover > *:not(.cl-badge-wrap) > * {
      filter: blur(0) !important;
    }
    .cl-modified[data-cl-mode="blur"]::before {
      content: "👁 Hover to reveal";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(99, 102, 241, 0.88);
      color: #fff;
      font-size: 11px;
      font-family: system-ui, sans-serif;
      padding: 4px 10px;
      border-radius: 4px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 9998;
    }
    .cl-modified[data-cl-mode="blur"]:hover::before {
      display: none;
    }

    .cl-modified[data-cl-mode="highlight"] {
      outline: 2px solid rgba(239, 68, 68, 0.65) !important;
      outline-offset: 3px !important;
      background-color: rgba(239, 68, 68, 0.04) !important;
    }
  `;
  document.head.appendChild(style);
}

function getBadgeLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score >= 9) return 'very-high';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function scoreSummary(score: number): string {
  if (score >= 9) return 'Very likely AI';
  if (score >= 7) return 'Likely AI';
  if (score >= 4) return 'Possibly AI';
  return 'Likely human';
}

/**
 * Inject a score badge as a positioned overlay on the top-right of the element.
 * Always called for every scored block regardless of threshold.
 * Skips if a badge already exists on this element.
 */
export function injectBadge(el: Element, score: number) {
  // If badge already shows this exact score, do nothing (no flicker)
  const existing = el.querySelector('.cl-badge-wrap');
  if (existing) {
    const existingBadge = existing.querySelector('.cl-badge');
    if (existingBadge) {
      const icon = score >= 7 ? '🤖' : score >= 4 ? '🔶' : '✅';
      const expectedText = `${icon} ${score}/10`;
      if (existingBadge.textContent === expectedText) return;
    }
    // Score changed (virtual scroll recycled this node) — remove stale badge
    existing.remove();
  }

  const level = getBadgeLevel(score);

  const wrap = document.createElement('span');
  wrap.className = CLASS_BADGE_WRAP;

  const badge = document.createElement('span');
  badge.className = 'cl-badge';
  badge.dataset.level = level;
  badge.title = `ContentLens AI score: ${score}/10 — ${scoreSummary(score)}`;
  badge.setAttribute('aria-label', `AI likelihood score ${score} out of 10`);

  const icon = score >= 7 ? '🤖' : score >= 4 ? '🔶' : '✅';
  badge.textContent = `${icon} ${score}/10`;

  wrap.appendChild(badge);

  // Strategy: try to append inline to the deepest text-containing child
  // so the badge flows after the text and is never clipped by overflow:hidden.
  const deepestText = findDeepestTextChild(el);
  const target = deepestText ?? el;
  target.appendChild(wrap);
}

/**
 * Walk to the last block/inline child that contains meaningful text.
 * This avoids placing the badge inside a meta/icon span that has no text.
 */
function findDeepestTextChild(el: Element): Element | null {
  // Collect direct children that carry text (not purely structural)
  const kids = Array.from(el.children);
  // Walk backwards to find last meaningful text child
  for (let i = kids.length - 1; i >= 0; i--) {
    const kid = kids[i];
    const tag = kid.tagName;
    if (['SCRIPT', 'STYLE', 'SVG', 'IMG', 'BUTTON', 'INPUT'].includes(tag)) continue;
    const txt = (kid.textContent ?? '').trim();
    if (txt.length >= 10) return kid;
  }
  return null;
}

/**
 * Apply a filter action (blur/hide/highlight/badge-only) to an element.
 * Called only when score ≥ threshold.
 * When mode = 'badge', we only show the badge (already handled by injectBadge).
 */
export function applyFilter(el: Element, score: number, mode: FilterMode) {
  // Mark as filtered
  el.classList.add(CLASS_MODIFIED);
  el.setAttribute(ATTR_SCORE, String(score));
  el.setAttribute(ATTR_MODE, mode);
  // Badge is always injected separately via injectBadge — nothing extra needed for 'badge' mode
}

/** Remove filter mode styling but keep the score badge intact */
export function removeFilter(el: Element) {
  el.classList.remove(CLASS_MODIFIED);
  el.removeAttribute(ATTR_SCORE);
  el.removeAttribute(ATTR_MODE);
}

/** Remove filter styling AND the score badge from an element */
export function removeAll(el: Element) {
  removeFilter(el);
  el.querySelectorAll(`.${CLASS_BADGE_WRAP}`).forEach((b) => b.remove());
  el.querySelectorAll('.cl-badge').forEach((b) => b.remove());
}

/** Remove ALL ContentLens modifications from the document */
export function clearAllFilters() {
  document.querySelectorAll(`.${CLASS_MODIFIED}`).forEach((el) => removeFilter(el));
}

/** Remove ALL modifications including badges from the entire document */
export function clearEverything() {
  document.querySelectorAll(`.${CLASS_MODIFIED}`).forEach((el) => removeAll(el));
  // Also clean up any orphaned badge wraps
  document.querySelectorAll(`.${CLASS_BADGE_WRAP}`).forEach((b) => b.remove());
}

/** Re-apply mode to all currently scored elements after settings change */
export function reapplyMode(
  scoredElements: Map<Element, number>,
  threshold: number,
  mode: FilterMode
) {
  // Clear filter marks (keep badges)
  clearAllFilters();

  scoredElements.forEach((score, el) => {
    if (!document.contains(el)) return;
    // Always ensure badge is present
    injectBadge(el, score);
    // Apply filter only above threshold
    if (score >= threshold) {
      applyFilter(el, score, mode);
    }
  });
}
// ─── Paywall banner ───────────────────────────────────────────────────────────

const PAYWALL_ID = 'cl-paywall-banner';

/**
 * Show a non-intrusive bottom banner informing the user their trial has expired.
 * @param daysLeft  Pass a positive number during trial (shows countdown),
 *                  or 0/negative to show the expired CTA.
 */
export function showPaywallBanner(daysLeft: number) {
  if (document.getElementById(PAYWALL_ID)) return; // already shown

  const banner = document.createElement('div');
  banner.id = PAYWALL_ID;

  const isExpired = daysLeft <= 0;
  const msg = isExpired
    ? 'Your ContentLens free trial has ended.'
    : `ContentLens free trial: <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</strong>`;

  banner.innerHTML = `
    <style>
      #cl-paywall-banner {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 2147483646 !important;
        background: ${isExpired ? '#1e1b4b' : '#312e81'} !important;
        color: #e0e7ff !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        font-size: 13px !important;
        padding: 10px 20px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 16px !important;
        box-shadow: 0 -2px 12px rgba(0,0,0,0.35) !important;
        border-top: 1px solid rgba(99,102,241,0.4) !important;
      }
      #cl-paywall-banner .cl-pw-msg {
        flex: 1 !important;
        text-align: center !important;
        line-height: 1.4 !important;
      }
      #cl-paywall-banner .cl-pw-cta {
        background: #6366f1 !important;
        color: #fff !important;
        border: none !important;
        border-radius: 6px !important;
        padding: 6px 16px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        white-space: nowrap !important;
        text-decoration: none !important;
        display: inline-block !important;
      }
      #cl-paywall-banner .cl-pw-cta:hover {
        background: #4f46e5 !important;
      }
      #cl-paywall-banner .cl-pw-close {
        background: none !important;
        border: none !important;
        color: #a5b4fc !important;
        cursor: pointer !important;
        font-size: 16px !important;
        padding: 0 4px !important;
        line-height: 1 !important;
      }
    </style>
    <span class="cl-pw-msg">🔍 ${msg}</span>
    <a class="cl-pw-cta" href="${DODO_PAYMENT_LINK}" target="_blank" rel="noopener">
      ${isExpired ? 'Unlock Lifetime — $9' : 'Upgrade — $9 Lifetime'}
    </a>
    <button class="cl-pw-close" title="Dismiss for now">✕</button>
  `;

  banner.querySelector('.cl-pw-close')?.addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
}

export function showAccessBlockedBanner(reason: AccessReason, daysLeft = 0) {
  if (reason === 'blocked_signed_out') {
    if (document.getElementById(PAYWALL_ID)) return;
    const banner = document.createElement('div');
    banner.id = PAYWALL_ID;
    banner.innerHTML = `
      <style>
        #cl-paywall-banner {
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2147483646 !important;
          background: #1e1b4b !important;
          color: #e0e7ff !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          font-size: 13px !important;
          padding: 10px 20px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 16px !important;
          box-shadow: 0 -2px 12px rgba(0,0,0,0.35) !important;
          border-top: 1px solid rgba(99,102,241,0.4) !important;
        }
        #cl-paywall-banner .cl-pw-msg {
          flex: 1 !important;
          text-align: center !important;
          line-height: 1.4 !important;
        }
      </style>
      <span class="cl-pw-msg">🔒 Sign in to start using ContentLens.</span>
    `;
    document.body.appendChild(banner);
    return;
  }

  // Trial expired and unknown states fall back to paywall-style messaging.
  showPaywallBanner(daysLeft);
}

export function removePaywallBanner() {
  document.getElementById(PAYWALL_ID)?.remove();
}
