// src/scoring/heuristics.ts
// Local heuristic-based AI-likelihood scoring engine
// Produces a score on a 1–10 scale based on statistical text features.
// Higher score = more likely AI-generated.

import { HeuristicFeatures } from '../shared/types';

// ─── AI-style phrase patterns ────────────────────────────────────────────────
// Covers GPT-4/Claude/Gemini output signatures, social media AI reply patterns,
// structured LLM prose markers, and sycophantic openers common in chatbot replies.
const AI_PHRASE_PATTERNS: RegExp[] = [

  // ── Sycophantic openers (very strong AI signal on social media) ────────────
  /\b(great|excellent|good|wonderful|fantastic|amazing|valid|insightful|thought[- ]?ful)\s+(question|point|observation|perspective|post|comment|insight)\b/i,
  /\b(certainly|absolutely|of course|indeed|definitely|sure thing|sure,)\b/i,
  /\bthank you for (sharing|your|the|raising|asking|bringing)\b/i,
  /\bthanks for (sharing|posting|commenting|the thoughtful|your thoughtful)\b/i,
  /\bthanks? for (bringing this|highlighting|pointing this out|the question)\b/i,
  /\bi appreciate (your|the) (insight|perspective|input|question|comment)\b/i,
  /\bthat's a (great|solid|important|fair|valid) (point|question|observation|take)\b/i,
  /\byou('ve| have) (raised|made|brought up|touched on) (a |an )?(valid|important|excellent|great|key|interesting)\b/i,
  /\b(i understand (your|the|your concern|the concern|that))\b/i,
  /\b(i('d| would) be happy to|allow me to|let me (explain|clarify|address|break|walk))\b/i,

  // ── AI self-identification ────────────────────────────────────────────────
  /\bas an ai\b/i,
  /\bi('m| am) an ai\b/i,
  /\bas a language model\b/i,
  /\bi don't have (personal |the ability to |access to |real-time)\b/i,
  /\bmy (training|knowledge) (data|cutoff|base)\b/i,
  /\bi cannot (browse|access|provide personal|guarantee accuracy)\b/i,

  // ── Structural discourse markers (LLM loves ordered prose) ────────────────
  /\bin (conclusion|summary|closing|short|brief|essence)\b[,:]?\s/i,
  /\bto (summarize|recap|sum up|conclude|wrap up)\b/i,
  /\b(firstly|secondly|thirdly|fourthly|lastly|finally)[,:\s]/i,
  /\b(first and foremost|last but not least)\b/i,
  /\b(on (the |)one hand|on (the |)other hand)\b/i,
  /\bthat (said|being said|noted)[,\s]/i,
  /\bwith that (said|in mind)[,\s]/i,
  /\b(overall|in general|in summary|all in all|at the end of the day)[,\s]/i,
  /\bit is (worth|important|essential|crucial|key) to (note|mention|highlight|emphasize|consider|remember)\b/i,
  /\bone (key|important|crucial|critical|significant|notable) (aspect|factor|point|consideration|thing|benefit)\b/i,
  /\bmove(s)? (forward|on) (by|to|with)\b/i,

  // ── Filler transitions (extremely common in AI output) ────────────────────
  /\b(furthermore|moreover|additionally|consequently|nevertheless|nonetheless|notwithstanding|henceforth)\b/i,
  /\bmore importantly\b/i,
  /\bthat (means|suggests|implies) (that )?\b/i,
  /\bfrom this perspective\b/i,
  /\bin practical terms\b/i,
  /\b(in (addition|contrast|particular|this context|this regard|other words))[,\s]/i,
  /\b(as (a result|such|mentioned|stated|noted|discussed|outlined))[,\s]/i,
  /\bit's (also|worth) (noting|mentioning|highlighting) that\b/i,
  /\bthis (is|can be) (seen|observed|noted|understood) (in|as|from)\b/i,

  // ── Corporate/consulting buzzwords (heavy LLM usage) ─────────────────────
  /\b(leverag(e|ing|ed)|utiliz(e|ing|ed)|implement(ing|ed)?|facilitat(e|ing|ed))\b/i,
  /\b(comprehensive|holistic|robust|scalable|streamline[d]?|optimize[d]?)\b/i,
  /\b(synerg(y|ies|istic)|paradigm( shift)?|ecosystem|framework)\b/i,
  /\b(actionable|impactful|innovative|transformative|disruptive|cutting[- ]edge)\b/i,
  /\b(best practices?|key takeaways?|core competenc(y|ies))\b/i,
  /\b(stakeholder(s)?|deliverable(s)?|bandwidth|touch base|circle back)\b/i,
  /\b(moving forward|going forward|at this juncture|in this space)\b/i,

  // ── Helper/assistant phrases ───────────────────────────────────────────────
  /\bfeel free to (ask|reach out|contact|let me know)\b/i,
  /\bif it helps[,:\s]/i,
  /\bhere's why\b/i,
  /\bi hope (this (helps|clarifies|answers|is helpful)|that helps)\b/i,
  /\bi hope this gives (you )?(clarity|context|a clearer picture)\b/i,
  /\b(please (don't hesitate|feel free)|let me know if (you (have|need)|there('s| is)))\b/i,
  /\bif you (have|need) (any|further|more|additional) (questions?|help|information|clarification)\b/i,
  /\b(happy to|glad to) (help|assist|answer|clarify|elaborate)\b/i,
  /\bdon't hesitate to\b/i,
  /\bis there anything (else|more|I can)\b/i,

  // ── Hedging and epistemic markers (LLM caution language) ─────────────────
  /\bit('s| is) (important|essential|crucial|vital|critical) (to (note|understand|remember|consider|recognize))\b/i,
  /\bplease (note|be aware|keep in mind) that\b/i,
  /\bit('s| is) (worth|important) (noting|mentioning) that\b/i,
  /\b(keep in mind|bear in mind|it should be noted) that\b/i,
  /\b(generally speaking|broadly speaking|in most cases|in many cases|in some cases)\b/i,
  /\b(while (it('s| is) true|this (is|may be)|there are))\b/i,
  /\bit depends on (the|your|several|a few)\b/i,
  /\bthat said[,:\s]/i,
  /\bto be fair[,:\s]/i,
  /\bthe (key|main|primary|core|central) (takeaway|message|point|difference|distinction|factor) (here |is )\b/i,

  // ── Blog/essay AI patterns ────────────────────────────────────────────────
  /\b(in today's|in the modern|in the current|in the digital|in our) (world|society|age|era|landscape|day and age)\b/i,
  /\bthe (art|world|realm|landscape|domain|sphere|field) of\b/i,
  /\bwhen it comes to\b/i,
  /\b(plays? a (vital|crucial|key|pivotal|important|significant) role)\b/i,
  /\b(has (become|emerged as|proven|shown)) (a |an )?(key|vital|essential|critical|important|popular)\b/i,
  /\b(delve|delving|dive) (into|deeper|further)\b/i,
  /\bunlock(ing)? (the|your|its|their) (full |true |)potential\b/i,
  /\bempower(ing|ed)? (users?|individuals?|people|you|teams?)\b/i,
  /\bnavigate (the|this|these|a|an) (complex|challenging|ever-changing|dynamic|rapidly)\b/i,

  // ── Twitter/social-media specific AI reply patterns ───────────────────────
  /\bthis (is|was) (a |an )?(great|important|interesting|excellent|valid|good) (point|observation|take|post|thread|discussion)\b/i,
  /\b(you('re| are) (absolutely|completely|totally|entirely) right)\b/i,
  /\bthis is exactly (it|right|what)\b/i,
  /\bexactly this\b/i,
  /\bnailed it\b/i,
  /\byou nailed (it|this|the point)\b/i,
  /\bthis is such an important (point|reminder|thread|message)\b/i,
  /\bappreciate you (sharing|posting|saying) this\b/i,
  /\bthis needs to be said\b/i,
  /\bthis is the kind of (nuance|take|discussion) we need\b/i,
  /\b(couldn't (agree|have said it) (more|better))\b/i,
  /\bspot on\b/i,
  /\bwell (said|put|articulated|stated|expressed)\b/i,
  /\bvery well said\b/i,
  /\bthis deserves more attention\b/i,
  /\bmore people need to hear this\b/i,
  /\bthis should be pinned\b/i,
  /\bfor anyone wondering[,:\s]/i,
  /\bfor those asking[,:\s]/i,
  /\bquick breakdown[,:\s]/i,
  /\b100% (agree|correct|right|this|true)\b/i,
  /\b100 percent (agree|correct|right|true)\b/i,
  /\btotally agree (with this|here|on this|with you)\b/i,
  /\bstrongly agree\b/i,
  /\b(this (resonates|aligns) with)\b/i,
  /\b(to (your|the) point about)\b/i,
  /\bbuilding on (this|that|your point|what you('ve| have) said)\b/i,
  /\b(it's|it is) (also|equally|particularly) (worth|important) (considering|noting|mentioning)\b/i,

  // ── List/structure openers ────────────────────────────────────────────────
  /\bhere('s| is|are) (a few|some|the|an overview|a breakdown|a list|a summary|the key|the main)\b/i,
  /\bhere are (a few|some|the main|the key|several) (things|points|reasons|ideas|factors)\b/i,
  /\bin short[,:\s]/i,
  /\blong story short[,:\s]/i,
  /\bquick summary[,:\s]/i,
  /\bbottom line[,:\s]/i,
  /\bthe short answer is\b/i,
  /\b(there are (several|many|a few|multiple|various|key|main)) (ways?|reasons?|factors?|aspects?|benefits?|challenges?)\b/i,
  /\b(key (points?|aspects?|factors?|takeaways?|insights?|benefits?|features?|differences?)):?\s/i,
];

// ─── Weighted phrase scoring ───────────────────────────────────────────────────
// Some patterns are stronger signals than others.
// Social-sycophancy patterns on Twitter get extra weight.
const HIGH_SIGNAL_PATTERNS: RegExp[] = [
  /\b(certainly|absolutely)\b/i,
  /\bas an ai\b/i,
  /\bgreat (question|point|observation)\b/i,
  /\bthanks for (sharing|bringing this up)\b/i,
  /\bi hope this helps\b/i,
  /\bfeel free to\b/i,
  /\b(furthermore|moreover|additionally)\b/i,
  /\bin (conclusion|summary)\b/i,
  /\b(firstly|secondly|thirdly)[,:\s]/i,
  /\bhere's why\b/i,
  /\b(comprehensive|holistic|leverag(e|ing))\b/i,
  /\bdon't hesitate to\b/i,
  /\b(delve|delving) into\b/i,
  /\bwell (said|put)\b/i,
  /\bnailed it\b/i,
  /\bexactly this\b/i,
  /\bfor anyone wondering[,:\s]/i,
  /\b100% (agree|correct|right)\b/i,
  /\btotally agree\b/i,
  /\bspot on\b/i,
];

// ─── Feature Extraction ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
}

function getSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

/** Type-Token Ratio: low diversity → more AI-like → higher score contribution */
function computeTypeTokenRatio(tokens: string[]): number {
  if (tokens.length === 0) return 0.5;
  const unique = new Set(tokens).size;
  return unique / tokens.length; // Range: 0–1, low = repetitive
}

/** Repetition score: ratio of repeated bigrams/trigrams → higher = more AI-like */
function computeRepetitionScore(tokens: string[]): number {
  if (tokens.length < 3) return 0;
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  const uniqueBigrams = new Set(bigrams).size;
  const repetition = 1 - uniqueBigrams / bigrams.length;
  return Math.min(1, repetition * 3); // amplify
}

/** Sentence length variance: low variance → more uniform → more AI-like */
function computeSentenceLengthVariance(sentences: string[]): number {
  if (sentences.length < 2) return 0.5;
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  // Normalize: high stdDev = variable (human), low = uniform (AI)
  return Math.min(1, stdDev / 10);
}

/** Shannon entropy approximation of character n-grams */
function computeEntropyScore(text: string): number {
  const freq: Record<string, number> = {};
  for (let i = 0; i < text.length - 1; i++) {
    const bigram = text[i] + text[i + 1];
    freq[bigram] = (freq[bigram] ?? 0) + 1;
  }
  const total = text.length - 1;
  if (total <= 0) return 0.5;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  // Normalize to 0–1 range. Typical range: 3–10 bits
  return Math.min(1, entropy / 10);
}

/** Count how many AI phrase patterns match → higher = more AI-like */
function computePhrasePatternsScore(text: string): number {
  const countMatches = (pattern: RegExp): number => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    const matches = text.match(re);
    return Math.min(2, matches?.length ?? 0); // cap repeats per pattern
  };

  let score = 0;
  for (const pattern of AI_PHRASE_PATTERNS) {
    score += countMatches(pattern);
  }
  // High-signal patterns each count as 2
  for (const pattern of HIGH_SIGNAL_PATTERNS) {
    score += countMatches(pattern); // +1 extra on top of the base score
  }
  // Normalize: score around 5 means strong AI phrase signal.
  return Math.min(1, score / 5);
}

/** Average sentence length: very long uniform sentences → AI-like */
function computeAvgSentenceLength(sentences: string[]): number {
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  return total / sentences.length;
}

/** Punctuation density: AI text tends toward moderate/structured punctuation */
function computePunctuationDensity(text: string): number {
  const punctuation = (text.match(/[,;:()–—]/g) ?? []).length;
  return Math.min(1, punctuation / (text.length / 10));
}

/** List-like structure score: numbered/bulleted lists are very common in AI */
function computeListLikeScore(text: string): number {
  const listPatterns = [
    /^\s*(\d+[.)]\s|\*\s|-\s|•\s)/m,
    /\n\s*(\d+[.)]\s|\*\s|-\s)/,
    /(first(ly)?[,:]|second(ly)?[,:]|third(ly)?[,:]|finally[,:])/i,
  ];
  let matches = 0;
  for (const p of listPatterns) {
    if (p.test(text)) matches++;
  }
  return Math.min(1, matches / 2);
}

/** Em-dash density: repeated em dashes are a common AI style artifact. */
function computeEmDashSignal(text: string): number {
  const emDashCount = (text.match(/—/g) ?? []).length;
  if (emDashCount === 0) return 0;
  // 2+ em dashes in one short reply is a strong signal.
  return Math.min(1, emDashCount / 3);
}

// ─── Feature Extraction Entry Point ──────────────────────────────────────────

export function extractFeatures(text: string): HeuristicFeatures {
  const tokens = tokenize(text);
  const sentences = getSentences(text);

  return {
    typeTokenRatio: computeTypeTokenRatio(tokens),
    repetitionScore: computeRepetitionScore(tokens),
    sentenceLengthVariance: computeSentenceLengthVariance(sentences),
    entropyScore: computeEntropyScore(text),
    phrasePatternsScore: computePhrasePatternsScore(text),
    avgSentenceLength: computeAvgSentenceLength(sentences),
    punctuationDensity: computePunctuationDensity(text),
    listLikeScore: computeListLikeScore(text),
  };
}

// ─── Scoring Logic ────────────────────────────────────────────────────────────

/**
 * Compute a 1–10 AI-likelihood score from text.
 *
 * Scoring model (weighted heuristic composite):
 *
 * Feature                    Weight   Direction
 * typeTokenRatio             -0.15    Low diversity → AI (inverted)
 * repetitionScore            +0.10    High repetition → AI
 * sentenceLengthVariance     -0.15    Low variance → AI (inverted)
 * entropyScore               -0.10    Lower entropy → AI (inverted)
 * phrasePatternsScore        +0.30    Pattern matches → AI (strongest signal)
 * avgSentenceLength          +0.05    Longer sentences → slight AI signal
 * punctuationDensity         +0.05    Moderate/high density → slight AI signal
 * listLikeScore              +0.10    Structured lists → AI
 */
export function scoreText(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length < 12) return 1;

  const f = extractFeatures(trimmed);
  const emDashSignal = computeEmDashSignal(trimmed);
  // Short social replies often carry mostly phrase signal.
  if (trimmed.length < 30) {
    const shortSignal = Math.max(f.phrasePatternsScore, emDashSignal);
    if (shortSignal >= 0.65) return 8;
    if (shortSignal >= 0.45) return 6;
    if (shortSignal >= 0.25) return 4;
    return 1;
  }

  // Invert low-gives-AI features
  const invertedTTR = 1 - f.typeTokenRatio;       // low TTR = repetitive = AI
  const invertedVariance = 1 - Math.min(1, f.sentenceLengthVariance); // low variance = AI
  const invertedEntropy = 1 - f.entropyScore;    // low entropy = AI

  // Average sentence length signal (normalize around 15–25 words as AI sweet spot)
  const avgLenSignal = f.avgSentenceLength > 10
    ? Math.min(1, (f.avgSentenceLength - 10) / 20)
    : 0;

  const phraseBoost = f.phrasePatternsScore >= 0.6
    ? 0.12
    : f.phrasePatternsScore >= 0.4
      ? 0.06
      : 0;
  const emDashBoost = emDashSignal >= 0.66
    ? 0.12
    : emDashSignal >= 0.33
      ? 0.06
      : 0;

  const rawScore = Math.min(
    1,
    invertedTTR * 0.13 +
    f.repetitionScore * 0.10 +
    invertedVariance * 0.12 +
    invertedEntropy * 0.09 +
    f.phrasePatternsScore * 0.38 +
    avgLenSignal * 0.05 +
    f.punctuationDensity * 0.04 +
    f.listLikeScore * 0.09 +
    phraseBoost +
    emDashBoost
  );

  // Map raw [0–1] score to [1–10]
  const score = Math.round(1 + rawScore * 9);
  return Math.max(1, Math.min(10, score));
}
