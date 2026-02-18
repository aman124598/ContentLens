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

## Privacy

- 100% local scoring — no network requests
- No raw text stored — only hashes + scores
- No identity or browsing data collected
