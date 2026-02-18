// src/utils/hash.ts
// Fast, deterministic hash for text blocks using djb2 algorithm

/**
 * Compute a deterministic string hash (djb2) from normalized text.
 * Returns a hex string for stable cache keying.
 */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    hash = hash >>> 0; // keep 32-bit unsigned
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Normalize text for consistent hashing:
 * - Lowercase
 * - Collapse whitespace
 * - Trim
 */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '') // strip zero-width chars
    .trim();
}
