import { describe, it, expect, beforeEach } from 'vitest';
import { GapDetector } from './gapDetector.js';

describe('GapDetector', () => {
  let detector: GapDetector;

  beforeEach(() => {
    detector = new GapDetector();
  });

  describe('detectGap()', () => {
    it('detects fallback response match', () => {
      const gap = detector.detectGap(
        'agent-1',
        'What is quantum physics?',
        'Sorry, I cannot help with that right now.',
        'Sorry, I cannot help with that right now.',
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('fallback_response');
      expect(gap!.query).toBe('What is quantum physics?');
    });

    it('detects "I don\'t know" uncertainty phrase', () => {
      const gap = detector.detectGap(
        'agent-1',
        'What is the capital of Atlantis?',
        "I don't know the answer to that question.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('uncertainty_phrase');
    });

    it('detects "I\'m not sure" uncertainty phrase', () => {
      const gap = detector.detectGap(
        'agent-1',
        'How tall is that building?',
        "I'm not sure about the exact height.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('uncertainty_phrase');
    });

    it('detects "I don\'t have information" uncertainty phrase', () => {
      const gap = detector.detectGap(
        'agent-1',
        'What happened in 1523?',
        "I don't have information about that specific event.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('uncertainty_phrase');
    });

    it('detects "beyond my knowledge" uncertainty phrase', () => {
      const gap = detector.detectGap(
        'agent-1',
        'Explain advanced nuclear fusion techniques',
        'That is beyond my knowledge at this point.',
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('uncertainty_phrase');
    });

    it('detects short response for complex query', () => {
      const gap = detector.detectGap(
        'agent-1',
        'Can you explain how photosynthesis works in detail including the light and dark reactions?',
        'Yes.',
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('short_response');
    });

    it('does not flag short response for simple query', () => {
      const gap = detector.detectGap(
        'agent-1',
        'Hello',
        'Hi!',
      );
      expect(gap).toBeNull();
    });

    it('does not flag normal confident response', () => {
      const gap = detector.detectGap(
        'agent-1',
        'What color is the sky?',
        'The sky appears blue because of the way Earth\'s atmosphere scatters sunlight. This is called Rayleigh scattering.',
      );
      expect(gap).toBeNull();
    });

    it('does not flag response that is not an exact fallback match', () => {
      const gap = detector.detectGap(
        'agent-1',
        'Tell me about dogs',
        'Dogs are wonderful pets! They are loyal companions.',
        'Sorry, I cannot help with that right now.',
      );
      expect(gap).toBeNull();
    });

    it('handles fallback comparison with whitespace differences', () => {
      const gap = detector.detectGap(
        'agent-1',
        'Question',
        '  Fallback response  ',
        'Fallback response',
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('fallback_response');
    });
  });

  describe('getGaps()', () => {
    it('returns empty array for agent with no gaps', () => {
      expect(detector.getGaps('agent-1')).toEqual([]);
    });

    it('returns all gaps for an agent', () => {
      detector.detectGap('agent-1', 'Q1', "I don't know");
      detector.detectGap('agent-1', 'Q2', "I'm not sure");

      const gaps = detector.getGaps('agent-1');
      expect(gaps).toHaveLength(2);
      expect(gaps[0].query).toBe('Q1');
      expect(gaps[1].query).toBe('Q2');
    });

    it('isolates gaps per agent', () => {
      detector.detectGap('agent-1', 'Q1', "I don't know");
      detector.detectGap('agent-2', 'Q2', "I'm not sure");

      expect(detector.getGaps('agent-1')).toHaveLength(1);
      expect(detector.getGaps('agent-1')[0].query).toBe('Q1');

      expect(detector.getGaps('agent-2')).toHaveLength(1);
      expect(detector.getGaps('agent-2')[0].query).toBe('Q2');
    });
  });

  describe('deleteAgent()', () => {
    it('cleans up gaps on agent deletion', () => {
      detector.detectGap('agent-1', 'Q1', "I don't know");
      expect(detector.getGaps('agent-1')).toHaveLength(1);

      detector.deleteAgent('agent-1');
      expect(detector.getGaps('agent-1')).toEqual([]);
    });

    it('returns false when agent had no gaps', () => {
      expect(detector.deleteAgent('nonexistent')).toBe(false);
    });

    it('returns true when agent gaps were deleted', () => {
      detector.detectGap('agent-1', 'Q1', "I don't know");
      expect(detector.deleteAgent('agent-1')).toBe(true);
    });

    it('does not affect other agents', () => {
      detector.detectGap('agent-1', 'Q1', "I don't know");
      detector.detectGap('agent-2', 'Q2', "I'm not sure");

      detector.deleteAgent('agent-1');

      expect(detector.getGaps('agent-1')).toEqual([]);
      expect(detector.getGaps('agent-2')).toHaveLength(1);
    });
  });

  describe('topic extraction', () => {
    it('extracts topic from first sentence', () => {
      detector.detectGap('agent-1', 'What is photosynthesis? I want to know more.', "I don't know");
      const gaps = detector.getGaps('agent-1');
      expect(gaps[0].topic).toBe('What is photosynthesis');
    });

    it('truncates long topics', () => {
      const longQuery = 'A'.repeat(100);
      detector.detectGap('agent-1', longQuery, "I don't know");
      const gaps = detector.getGaps('agent-1');
      expect(gaps[0].topic!.length).toBeLessThanOrEqual(80);
      expect(gaps[0].topic!.endsWith('...')).toBe(true);
    });
  });

  describe('GapEntry structure', () => {
    it('includes timestamp as Date', () => {
      const before = new Date();
      detector.detectGap('agent-1', 'Question', "I don't know");
      const after = new Date();

      const gaps = detector.getGaps('agent-1');
      expect(gaps[0].timestamp).toBeInstanceOf(Date);
      expect(gaps[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(gaps[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('includes reason field', () => {
      detector.detectGap('agent-1', 'Question', "I don't know");
      const gaps = detector.getGaps('agent-1');
      expect(gaps[0].reason).toBeDefined();
      expect(typeof gaps[0].reason).toBe('string');
    });
  });
});
