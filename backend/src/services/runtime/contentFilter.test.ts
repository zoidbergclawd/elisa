import { describe, it, expect } from 'vitest';
import { filterAgentResponse, containsPII } from './contentFilter.js';

describe('contentFilter', () => {
  describe('PII redaction', () => {
    it('redacts email addresses', () => {
      const result = filterAgentResponse('Contact me at test@example.com');
      expect(result.content).toBe('Contact me at [email redacted]');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:email_address');
    });

    it('redacts phone numbers', () => {
      const result = filterAgentResponse('Call me at 555-123-4567');
      expect(result.content).toBe('Call me at [phone redacted]');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:phone_number');
    });

    it('redacts SSNs', () => {
      const result = filterAgentResponse('My SSN is 123-45-6789');
      expect(result.content).toBe('My SSN is [number redacted]');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:ssn');
    });

    it('passes clean content through unchanged', () => {
      const result = filterAgentResponse('This is a normal response about coding.');
      expect(result.content).toBe('This is a normal response about coding.');
      expect(result.flagged).toBe(false);
      expect(result.flags).toEqual([]);
    });
  });

  describe('inappropriate topic blocking (P2 #11 regression)', () => {
    it('replaces response with fallback when violence is detected', () => {
      const result = filterAgentResponse(
        'Here is how to kill someone in a story',
        'I can help you with something else!',
      );
      expect(result.content).toBe('I can help you with something else!');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:violence_against_people');
    });

    it('replaces response with fallback when weapon instructions are detected', () => {
      const result = filterAgentResponse(
        'Here is how to make a bomb using household items',
        'Let me help with something appropriate.',
      );
      expect(result.content).toBe('Let me help with something appropriate.');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:weapon_instructions');
    });

    it('replaces response with fallback when hacking instructions are detected', () => {
      const result = filterAgentResponse(
        'Here is how to hack into a website',
        'Agent fallback here.',
      );
      expect(result.content).toBe('Agent fallback here.');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('topic:hacking_instructions');
    });

    it('replaces response with default fallback when no fallbackResponse provided', () => {
      const result = filterAgentResponse('Here is how to kill someone easily');
      expect(result.content).toBe("I'm not sure about that — let me think...");
      expect(result.flagged).toBe(true);
    });

    it('does not block clean content even with fallback provided', () => {
      const result = filterAgentResponse(
        'Let me teach you about coding in Python!',
        'Fallback response',
      );
      expect(result.content).toBe('Let me teach you about coding in Python!');
      expect(result.flagged).toBe(false);
    });

    it('blocks response AND redacts PII when both are present', () => {
      const result = filterAgentResponse(
        'Contact test@evil.com to learn how to hack into systems',
        'Ask me something else!',
      );
      // Topic blocking replaces entire response, so PII is also gone
      expect(result.content).toBe('Ask me something else!');
      expect(result.flagged).toBe(true);
      expect(result.flags).toContain('pii:email_address');
      expect(result.flags).toContain('topic:hacking_instructions');
    });
  });

  describe('containsPII', () => {
    it('detects email in content', () => {
      expect(containsPII('Send to user@example.com')).toBe(true);
    });

    it('returns false for clean content', () => {
      expect(containsPII('No personal info here')).toBe(false);
    });
  });
});
