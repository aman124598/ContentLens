# ContentLens - AI Reply Filter

[![Platform](https://img.shields.io/badge/Platform-Chrome%20Extension-blue)](#)
[![Manifest](https://img.shields.io/badge/Manifest-V3-5b67f1)](#)
[![Language](https://img.shields.io/badge/Code-TypeScript-3178c6)](#)
[![Pricing](https://img.shields.io/badge/Pricing-%249%20Lifetime-1f9d55)](#)
[![Trial](https://img.shields.io/badge/Trial-7%20Days-ffb020)](#)
[![Auth](https://img.shields.io/badge/Auth-Supabase-3ecf8e)](#)
[![Payments](https://img.shields.io/badge/Payments-Dodo-7a4bff)](#)

ContentLens is a Chrome extension that estimates AI-likelihood of replies/comments and lets users blur, hide, highlight, or badge-score suspected AI-generated text.

Important: scores are probabilistic heuristics, not definitive proof of AI authorship.

## Labels
- `Auth Required`: extension runs only after sign-in.
- `Trial`: 7-day free trial starts at first successful sign-in.
- `Paid Access`: required after trial expiry.
- `Local Scoring`: no raw page text sent to a scoring backend.
- `Site Control`: allowlist and blocklist behavior supported.

## Table Of Contents
1. [Features](#features)
2. [Access And Billing](#access-and-billing)
3. [Quick Start](#quick-start)
4. [Project Structure](#project-structure)
5. [Scoring Model](#scoring-model)
6. [Site Targeting](#site-targeting)
7. [Deployment](#deployment)
8. [Privacy](#privacy)

## Features
- Real-time AI-likelihood scoring on social replies/comments.
- Filter modes:
  - `Blur`
  - `Hide`
  - `Highlight`
  - `Badge`
- Domain-level controls:
  - run everywhere except blocked domains
  - run only on selected domains (allowlist mode)
- Session persistence across popup close/reopen.
- Trial + license gating enforced in background and content flows.

## Access And Billing
### Access policy
- Sign-in required before scoring/filtering starts.
- Free trial lasts 7 days.
- Trial starts on first successful sign-in.
- After trial expiry, paid license activation is required.
- If user is signed out or expired without license, scanning/scoring is fully blocked.

### Current payment setup
- Price: `$9` one-time for lifetime access.
- Checkout link:  
  `https://checkout.dodopayments.com/buy/pdt_0NYkwaaZugSG9iopGS3Qz?quantity=1`
- License validation endpoint:  
  `POST https://live.dodopayments.com/licenses/validate`

### License flow
1. User purchases via Dodo checkout.
2. User receives license key.
3. User activates key in extension popup.
4. Extension switches access state to paid/active.

## Quick Start
### 1. Install dependencies
```bash
npm install
```

### 2. Generate icons
```bash
node scripts/generate-icons.js
```
If needed:
```bash
npm install canvas
```

### 3. Build
```bash
npm run build
```

### 4. Load in Chrome
1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `dist/`.

## Project Structure
```text
src/
├── background/
│   └── index.ts          # Service worker: auth, access gate, scoring, settings
├── content/
│   ├── index.ts          # Content entrypoint and runtime gating
│   ├── domScanner.ts     # DOM extraction
│   ├── domModifier.ts    # Visual rendering and banners
│   └── cache.ts          # In-memory cache
├── popup/
│   ├── popup.ts          # Popup logic
│   ├── popup.html
│   └── popup.css
├── options/
│   ├── options.ts        # Settings page logic
│   ├── options.html
│   └── options.css
├── scoring/
│   └── heuristics.ts     # AI-likelihood scoring model
├── shared/
│   ├── auth.ts
│   ├── license.ts
│   ├── storage.ts
│   ├── supabase.ts
│   └── types.ts
└── utils/
    ├── hash.ts
    └── debounce.ts

public/
├── index.html            # Landing page for Vercel
├── manifest.json
├── popup.html
├── options.html
└── icons/
```

## Scoring Model
Score range: `1-10` (higher = more AI-like).

Primary signals:
- Type-token diversity
- N-gram repetition
- Sentence variance
- Entropy
- AI phrase pattern matches
- Structural/list signals
- Em-dash overuse signal

## Site Targeting
- Default mode: runs on all sites except domains marked `disabled`.
- Allowlist mode: runs only on domains marked `enabled`.
- Domain matching supports subdomains (for example, `example.com` also matches `www.example.com`).

## Deployment
### Vercel
- Config file: `vercel.json`
- Build output: `dist/`
- Landing page: `public/index.html`
- Rewrites:
  - `/popup` -> `/popup.html`
  - `/options` -> `/options.html`

### Release links
- GitHub release:  
  `https://github.com/aman124598/ContentLens/releases/tag/v.2026.1.0`

## Privacy
- Local heuristic scoring for page text.
- No raw text persisted in extension storage.
- Storage uses hashes + scores for cache efficiency.
- Auth/session metadata stored for access control.
- License checks call Dodo validation endpoint.
