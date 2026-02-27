/**
 * Post-processing content filter for the Elisa Agent Runtime.
 *
 * Lightweight regex-based filter (no AI-powered filtering) that
 * checks agent responses for:
 * - PII patterns (email, phone, physical address)
 * - Inappropriate topic indicators
 *
 * Returns filtered content with PII redacted and flags for logging.
 *
 * PRD-001 Section 6: Content guardrails
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface FilterResult {
  /** The filtered content (with PII redacted). */
  content: string;
  /** Whether any filtering was applied. */
  flagged: boolean;
  /** What was flagged (descriptive strings for logging). */
  flags: string[];
}

// ── PII Patterns ──────────────────────────────────────────────────────

/**
 * Email address pattern.
 * Matches common email formats like user@domain.com
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Phone number patterns.
 * Matches US phone formats: (555) 123-4567, 555-123-4567, 555.123.4567,
 * +1 555 123 4567, and 10+ digit sequences.
 */
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/**
 * Physical address pattern.
 * Matches patterns like "123 Main Street", "456 Oak Ave", etc.
 * Heuristic: number followed by street name followed by street suffix.
 */
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Place|Pl|Way|Circle|Cir|Trail|Trl)\b\.?/gi;

/**
 * Social Security Number pattern.
 * Matches: 123-45-6789 or 123 45 6789
 */
const SSN_PATTERN = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g;

const PII_PATTERNS: Array<{ pattern: RegExp; label: string; redaction: string }> = [
  { pattern: EMAIL_PATTERN, label: 'email_address', redaction: '[email redacted]' },
  { pattern: PHONE_PATTERN, label: 'phone_number', redaction: '[phone redacted]' },
  { pattern: ADDRESS_PATTERN, label: 'physical_address', redaction: '[address redacted]' },
  { pattern: SSN_PATTERN, label: 'ssn', redaction: '[number redacted]' },
];

// ── Topic Indicators ──────────────────────────────────────────────────

/**
 * Inappropriate topic indicator words/phrases.
 * These are heuristic and intentionally kept broad.
 * The safety guardrails in the system prompt are the primary defense;
 * this filter is a secondary post-processing check.
 */
const INAPPROPRIATE_TOPICS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:kill|murder|assassinate)\s+(?:someone|a person|people|him|her|them)\b/gi, label: 'violence_against_people' },
  { pattern: /\b(?:how to (?:make|build|create)\s+(?:a\s+)?(?:bomb|explosive|weapon))\b/gi, label: 'weapon_instructions' },
  { pattern: /\b(?:how to (?:hack|break into|bypass))\b/gi, label: 'hacking_instructions' },
  { pattern: /\b(?:self[- ]?harm|suicide)\b/gi, label: 'self_harm' },
];

// ── Redaction Placeholder ─────────────────────────────────────────────

const REDACTION_MARKER = '***';

// ── Filter Function ───────────────────────────────────────────────────

/**
 * Filter agent response content for PII and inappropriate topics.
 *
 * PII is redacted in the output. Inappropriate topics are flagged
 * but content is not modified (the flag can be used for logging
 * and parental dashboard reporting).
 */
export function filterAgentResponse(content: string): FilterResult {
  const flags: string[] = [];
  let filtered = content;

  // 1. Redact PII patterns
  for (const { pattern, label, redaction } of PII_PATTERNS) {
    // Reset lastIndex for global regex reuse
    pattern.lastIndex = 0;
    if (pattern.test(filtered)) {
      flags.push(`pii:${label}`);
      // Reset again before replace
      pattern.lastIndex = 0;
      filtered = filtered.replace(pattern, redaction);
    }
  }

  // 2. Check for inappropriate topic indicators (flag only, don't redact)
  for (const { pattern, label } of INAPPROPRIATE_TOPICS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      flags.push(`topic:${label}`);
    }
  }

  return {
    content: filtered,
    flagged: flags.length > 0,
    flags,
  };
}

/**
 * Check if content contains any PII patterns (without redacting).
 * Useful for quick checks before storage decisions.
 */
export function containsPII(content: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) return true;
  }
  return false;
}
