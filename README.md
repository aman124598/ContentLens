# ContentLens – AI Reply Filter

A Chrome extension (Manifest V3) that estimates AI-likelihood of text content on web pages and lets you blur, hide, highlight, or badge-score suspected AI-generated replies and comments.

> ⚠ Scores are **probabilistic heuristics** — not definitive AI detection.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Manifest V3 / TypeScript |
| Build | Vite + ESBuild |
| Scoring | Local heuristics (no server) |
| Storage | Chrome Storage API |
| UI | Vanilla HTML + CSS |

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Generate icons
```bash
node scripts/generate-icons.js
```
> Optionally install `canvas` (`npm install canvas`) first for styled icons.

### 3. Build
```bash
npm run build        # production build → dist/
npm run dev          # watch mode
```

### 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Access Model

- Sign-in is required before any scoring/filtering runs.
- Free trial lasts 7 days and starts on first successful sign-in.
- After trial expiry, a valid paid license key is required.
- When blocked (signed out or expired without license), content scanning/scoring is fully disabled.
- User session persists across popup closes/reopens (until extension data is cleared or extension is removed).

---

## Payments and License Activation (Dodo Payments)

Current checkout link (live):
- `https://checkout.dodopayments.com/buy/pdt_0NYkwaaZugSG9iopGS3Qz?quantity=1`

Current pricing:
- `$9` one-time payment for lifetime access.

Flow:
1. User purchases via the checkout link.
2. Dodo issues a license key.
3. User enters key in popup to activate.

License validation endpoint used by the extension:
- `POST https://live.dodopayments.com/licenses/validate`

---

## Project Structure

```
src/
├── content/           # Content script (DOM scanning, scoring, visual mods)
│   ├── index.ts       # Entry point
│   ├── domScanner.ts  # DOM traversal & text extraction
│   ├── domModifier.ts # Visual modifications (blur/hide/highlight/badge)
│   └── cache.ts       # In-memory score cache
├── background/
│   └── index.ts       # Service worker (scoring, settings, cache)
├── popup/             # Extension popup UI
├── options/           # Options / settings page
├── scoring/
│   └── heuristics.ts  # Local AI-likelihood heuristic engine
├── shared/
│   ├── types.ts       # Shared TypeScript types
│   └── storage.ts     # Chrome storage helpers
└── utils/
    ├── hash.ts        # Deterministic text hashing
    └── debounce.ts    # Debounce utility

public/
├── index.html         # Vercel landing page
├── manifest.json
├── popup.html
├── options.html
└── icons/
```

---

## Heuristic Scoring Model

Scores text on a **1–10 scale**. Signals used:

| Feature | Direction |
|---|---|
| Type-Token Ratio | Low diversity → AI |
| Bigram Repetition | High repetition → AI |
| Sentence Length Variance | Low variance → AI |
| Shannon Entropy | Low entropy → AI |
| AI Phrase Patterns | Match → AI (strongest signal) |
| Avg Sentence Length | Long uniform sentences → AI |
| List Structure | Numbered/bulleted lists → AI |

---

## Filter Modes

| Mode | Behavior |
|---|---|
| **Blur** | Blurs content; hover to reveal |
| **Hide** | Removes element from view |
| **Highlight** | Red outline on flagged content |
| **Badge** | Shows score badge only |

---

## Site Targeting

- Default mode: runs on all sites except explicitly disabled domains.
- Allowlist mode: runs only on explicitly enabled domains.
- Domain matching supports subdomains (e.g. `example.com` applies to `www.example.com`).

---

## Vercel Deployment

- `vercel.json` points build output to `dist/`.
- Landing page is served from `public/index.html`.
- Rewrites:
  - `/popup` -> `/popup.html`
  - `/options` -> `/options.html`

---

## Privacy

- Local text scoring (no raw page text sent to servers)
- No raw text stored — only hashes + scores
- Authentication/session metadata is stored for account access control
- License verification requests are sent to Dodo Payments only for key validation
