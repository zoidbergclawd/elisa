import { describe, it, expect } from 'vitest';
import { filterAgentResponse, containsPII } from '../../services/runtime/contentFilter.js';

describe('contentFilter', () => {
  describe('filterAgentResponse', () => {
    // ── Clean content passes through ────────────────────────────────

    it('passes clean content through unchanged', () => {
      const result = filterAgentResponse('Hello! I can help you learn about coding.');

      expect(result.content).toBe('Hello! I can help you learn about coding.');
      expect(result.flagged).toBe(false);
      expect(result.flags).toEqual([]);
    });

    it('passes code snippets through unchanged', () => {
      const code = 'function add(a, b) { return a + b; }';
      const result = filterAgentResponse(code);

      expect(result.content).toBe(code);
      expect(result.flagged).toBe(false);
    });

    it('passes empty string through', () => {
      const result = filterAgentResponse('');
      expect(result.content).toBe('');
      expect(result.flagged).toBe(false);
      expect(result.flags).toEqual([]);
    });

    // ── Email detection ─────────────────────────────────────────────

    it('detects and redacts email addresses', () => {
      const result = filterAgentResponse('You can reach me at john@example.com for more info.');

      expect(result.content).toContain('[email redacted]');
      expect(result.content).not.toContain('john@example.com');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:email_address');
    });

    it('detects multiple email addresses', () => {
      const result = filterAgentResponse('Contact alice@test.com or bob@school.edu');

      expect(result.content).not.toContain('alice@test.com');
      expect(result.content).not.toContain('bob@school.edu');
      expect(result.flags).toContain('pii:email_address');
    });

    // ── Phone number detection ──────────────────────────────────────

    it('detects US phone numbers with dashes', () => {
      const result = filterAgentResponse('Call me at 555-123-4567');

      expect(result.content).toContain('[phone redacted]');
      expect(result.content).not.toContain('555-123-4567');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:phone_number');
    });

    it('detects phone numbers with parentheses', () => {
      const result = filterAgentResponse('Call (555) 123-4567');

      expect(result.content).toContain('[phone redacted]');
      expect(result.flagged).toBe(true);
    });

    it('detects phone numbers with dots', () => {
      const result = filterAgentResponse('Call 555.123.4567');

      expect(result.content).toContain('[phone redacted]');
      expect(result.flagged).toBe(true);
    });

    // ── Physical address detection ──────────────────────────────────

    it('detects street addresses', () => {
      const result = filterAgentResponse('I live at 123 Main Street in Springfield');

      expect(result.content).toContain('[address redacted]');
      expect(result.content).not.toContain('123 Main Street');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:physical_address');
    });

    it('detects addresses with common suffixes', () => {
      const suffixes = ['Avenue', 'Ave', 'Boulevard', 'Blvd', 'Drive', 'Dr', 'Lane', 'Ln', 'Road', 'Rd'];

      for (const suffix of suffixes) {
        const result = filterAgentResponse(`Located at 456 Oak ${suffix}`);
        expect(result.flagged).toBe(true);
        expect(result.flags).toContain('pii:physical_address');
      }
    });

    // ── SSN detection ───────────────────────────────────────────────

    it('detects SSN-like patterns', () => {
      const result = filterAgentResponse('My number is 123-45-6789');

      expect(result.content).toContain('[number redacted]');
      expect(result.content).not.toContain('123-45-6789');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:ssn');
    });

    // ── Multiple PII types ──────────────────────────────────────────

    it('detects multiple PII types in one message', () => {
      const result = filterAgentResponse(
        'Email me at test@example.com or call 555-123-4567',
      );

      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:email_address');
      expect(result.flags).toContain('pii:phone_number');
      expect(result.content).not.toContain('test@example.com');
      expect(result.content).not.toContain('555-123-4567');
    });

    // ── Inappropriate topic detection ───────────────────────────────

    it('flags violence against people', () => {
      const result = filterAgentResponse('Here is how to kill someone');

      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:violence_against_people');
    });

    it('flags weapon instructions', () => {
      const result = filterAgentResponse('how to make a bomb');

      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:weapon_instructions');
    });

    it('flags hacking instructions', () => {
      const result = filterAgentResponse('how to hack into a computer');

      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:hacking_instructions');
    });

    it('flags self-harm references', () => {
      const result = filterAgentResponse('content about self-harm');

      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:self_harm');
    });

    it('does not flag safe use of flagged words in different context', () => {
      // "kill" alone should not flag — only "kill someone/people/etc."
      const result = filterAgentResponse('Press Ctrl+C to kill the process');
      expect(result.flags).not.toContain('topic:violence_against_people');
    });

    // ── Topic flags do not modify content ───────────────────────────

    it('topic flags do not redact content (only PII is redacted)', () => {
      const input = 'how to make a bomb';
      const result = filterAgentResponse(input);

      // Content stays the same for topic flags (logged for review, not redacted)
      expect(result.content).toBe(input);
      expect(result.flagged).toBe(true);
    });
  });

  describe('containsPII', () => {
    it('returns true when content has email', () => {
      expect(containsPII('email: user@test.com')).toBe(true);
    });

    it('returns true when content has phone', () => {
      expect(containsPII('call 555-123-4567')).toBe(true);
    });

    it('returns false for clean content', () => {
      expect(containsPII('Hello world')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(containsPII('')).toBe(false);
    });
  });

  describe('repeated calls (regex state safety)', () => {
    it('produces consistent results on repeated calls with same input', () => {
      const input = 'Contact john@example.com at 555-123-4567';

      const r1 = filterAgentResponse(input);
      const r2 = filterAgentResponse(input);
      const r3 = filterAgentResponse(input);

      expect(r1.flags).toEqual(r2.flags);
      expect(r2.flags).toEqual(r3.flags);
      expect(r1.content).toBe(r2.content);
      expect(r2.content).toBe(r3.content);
    });
  });
});
