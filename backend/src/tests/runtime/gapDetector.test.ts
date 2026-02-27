import { describe, it, expect } from 'vitest';
import { GapDetector } from '../../services/runtime/gapDetector.js';

describe('GapDetector', () => {
  describe('detectGap', () => {
    it('detects fallback response as a gap', () => {
      const detector = new GapDetector();
      const gap = detector.detectGap(
        'agent-1',
        'What is quantum computing?',
        "I'm not sure about that.",
        "I'm not sure about that.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('fallback_response');
      expect(gap!.topic).toBe('What is quantum computing');
    });

    it('detects uncertainty phrases as a gap', () => {
      const detector = new GapDetector();
      const gap = detector.detectGap(
        'agent-1',
        'Tell me about black holes',
        "I don't know much about black holes unfortunately.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('uncertainty_phrase');
    });

    it('detects short response for complex query', () => {
      const detector = new GapDetector();
      const gap = detector.detectGap(
        'agent-1',
        'Can you explain how photosynthesis works in detail?',
        'Maybe.',
      );
      expect(gap).not.toBeNull();
      expect(gap!.reason).toBe('short_response');
    });

    it('returns null for normal responses', () => {
      const detector = new GapDetector();
      const gap = detector.detectGap(
        'agent-1',
        'What is 2+2?',
        'The answer is 4! Two plus two equals four.',
      );
      expect(gap).toBeNull();
    });

    it('extracts topic from first sentence of query', () => {
      const detector = new GapDetector();
      const gap = detector.detectGap(
        'agent-1',
        'What is gravity? Also, what about magnetism?',
        "I don't know about that.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.topic).toBe('What is gravity');
    });

    it('truncates long topics to 80 characters', () => {
      const detector = new GapDetector();
      const longQuery = 'A'.repeat(100);
      const gap = detector.detectGap(
        'agent-1',
        longQuery,
        "I'm not sure about that.",
      );
      expect(gap).not.toBeNull();
      expect(gap!.topic!.length).toBeLessThanOrEqual(80);
      expect(gap!.topic).toMatch(/\.\.\.$/);
    });
  });

  describe('getGaps', () => {
    it('returns empty array for unknown agent', () => {
      const detector = new GapDetector();
      expect(detector.getGaps('unknown')).toEqual([]);
    });

    it('accumulates gaps for an agent', () => {
      const detector = new GapDetector();
      detector.detectGap('agent-1', 'Q1', "I don't know.", undefined);
      detector.detectGap('agent-1', 'Q2', "I'm not sure.", undefined);
      const gaps = detector.getGaps('agent-1');
      expect(gaps).toHaveLength(2);
    });

    it('keeps gaps separate between agents', () => {
      const detector = new GapDetector();
      detector.detectGap('agent-1', 'Q1', "I don't know.", undefined);
      detector.detectGap('agent-2', 'Q2', "I'm not sure.", undefined);
      expect(detector.getGaps('agent-1')).toHaveLength(1);
      expect(detector.getGaps('agent-2')).toHaveLength(1);
    });
  });

  describe('deleteAgent', () => {
    it('removes gaps for deleted agent', () => {
      const detector = new GapDetector();
      detector.detectGap('agent-1', 'Q1', "I don't know.", undefined);
      expect(detector.getGaps('agent-1')).toHaveLength(1);

      const deleted = detector.deleteAgent('agent-1');
      expect(deleted).toBe(true);
      expect(detector.getGaps('agent-1')).toEqual([]);
    });

    it('returns false for unknown agent', () => {
      const detector = new GapDetector();
      expect(detector.deleteAgent('unknown')).toBe(false);
    });
  });
});
