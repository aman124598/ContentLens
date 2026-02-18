techstack.md – AI Reply Filtering Chrome Extension
1. Overview

This document defines the recommended technology stack for building the AI Reply Filtering Chrome Extension, covering:

Extension architecture

Scoring engine

Backend (optional)

Data handling

Performance & privacy considerations

Deployment infrastructure

The stack is designed for scalability, low latency, privacy awareness, and maintainability.

2. Chrome Extension Layer
2.1 Core Technologies

Manifest Version: Manifest V3

Language: JavaScript / TypeScript (recommended: TypeScript)

Extension APIs: Chrome Extension APIs

2.2 Key Components
Component	Recommended Tech
Content Scripts	TypeScript
Background Service Worker	TypeScript
Popup UI	HTML + CSS + TypeScript
Options Page	HTML + CSS + TypeScript
Build System	Vite / ESBuild
Package Manager	npm / pnpm
Why TypeScript?

Strong typing reduces runtime errors

Better maintainability

Improved refactoring safety

Easier scaling of codebase

2.3 UI Framework Options

Option A – Vanilla UI (Lightweight)

HTML + CSS

Minimal overhead

Best for MVP

Option B – React (Advanced UI)

React + TypeScript

Cleaner state management

Easier feature expansion

Recommendation

MVP → Vanilla

Advanced version → React

3. DOM Processing & Text Extraction
Libraries / APIs

Native DOM APIs

MutationObserver API

Optional helpers:

lodash (debounce/throttle)

nanoid / hashing utilities

Responsibilities

Efficient DOM traversal

Dynamic content detection

Text block identification

Element mapping for visual updates

4. AI-Likelihood Scoring Engine

You have three viable stack paths.

Option A – Remote API-Based Scoring (Most Practical)
Extension → Backend → Model
Backend Stack
Layer	Recommended Tech
Runtime	Node.js
Language	TypeScript
Framework	Fastify / Express
API Style	REST
Hosting	Cloudflare / AWS / Render
ML / Detection Engine

Possible choices:

Python microservice (most flexible)

Node-based inference (limited but possible)

Python ML Stack (Recommended)
Purpose	Tech
Language	Python
Framework	FastAPI
ML Libraries	PyTorch / Transformers
Model Type	Classifier / Heuristic Hybrid
Deployment	Docker
Advantages

Centralized updates

Heavy models allowed

Better detection logic

Disadvantages

Requires infra

Latency management needed

Privacy considerations

Option B – Local Heuristic-Based Scoring (Privacy-First)

No ML model required.

Stack

TypeScript

Statistical heuristics

Lightweight algorithms

Possible metrics:

Repetition analysis

Token diversity

Sentence entropy approximation

Burstiness metrics

Phrase template matching

Advantages

No server costs

Instant scoring

Maximum privacy

Disadvantages

Lower accuracy

Easier to evade

Option C – On-Device ML Model (Advanced / Complex)
Stack
Component	Tech
Runtime	JavaScript
ML Engine	TensorFlow.js / ONNX Runtime Web
Model Format	Quantized / Distilled
Language	TypeScript
Advantages

No backend required

Better scoring than heuristics

Disadvantages

Extension size constraints

CPU usage

Optimization complexity

5. Data Handling & Caching
Recommended Technologies

Chrome Storage API

In-memory caching

Hash-based keying

Data Strategy

Store:

Text hashes (not raw text)

Scores

Domain rules

User preferences

Avoid:

Raw content storage

Sensitive page data

6. Privacy & Security Considerations
Client-Side

Minimal permissions in manifest.json

Explicit host permissions

No hidden background requests

Clear disclosure of network usage

Network Security

If backend used:

HTTPS only

Rate limiting

No long-term text logging

Optional anonymization

7. Build & Tooling
Tool	Purpose
Vite / ESBuild	Fast builds
TypeScript	Static typing
ESLint	Code quality
Prettier	Formatting
Husky	Git hooks (optional)
8. Deployment Infrastructure (Backend Option)
Minimal Infra

API Server → Cloudflare Workers / Render / Railway

ML Service → Docker container

CDN → Static assets

Scalable Infra

API Gateway

Autoscaling containers

Redis cache (optional)

Observability (Prometheus / Logs)

9. Performance Optimization Stack

Key techniques:

Debouncing DOM scans

Batched scoring requests

Cache by hash

Skip short text

Avoid layout thrashing

Helpful utilities:

lodash.debounce

fast hashing functions

10. Recommended Stack by Development Phase
MVP (Fastest Path)

Manifest V3

TypeScript

Vanilla Popup UI

Local heuristic scoring

No backend

Production-Ready Version

TypeScript extension

Backend scoring API

Python classifier service

Smart caching

Domain adapters

Advanced / Differentiated Version

React UI

Explainable signals

Hybrid detection engine

On-device inference (optional)

11. Final Recommendation

For best balance of accuracy, flexibility, and maintainability:

✅ TypeScript + Manifest V3
✅ Remote scoring API + Python classifier
✅ Heuristic pre-filtering in extension
✅ Hash-based caching
✅ Vanilla UI → React later