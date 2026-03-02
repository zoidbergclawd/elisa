import { describe, it, expect } from 'vitest';
import {
  generateSafetyPrompt,
  hasSafetyGuardrails,
  SAFETY_RULE_KEYS,
} from '../../services/runtime/safetyGuardrails.js';

describe('safetyGuardrails', () => {
  describe('generateSafetyPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toBeTruthy();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('includes the safety rules header', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('## Safety Rules (always enforced)');
    });

    it('includes age-appropriate content rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('Age-appropriate content only');
      expect(prompt).toContain('kids aged 8-14');
      expect(prompt).toContain('trusted adult');
    });

    it('includes no-PII rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('No personal information');
      expect(prompt).toContain('home addresses');
      expect(prompt).toContain('school names');
      expect(prompt).toContain('phone numbers');
      expect(prompt).toContain('email addresses');
    });

    it('includes medical/legal/safety redirect rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('Medical, legal, and safety redirects');
      expect(prompt).toContain('please ask a trusted adult');
    });

    it('includes not-real-person rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('Never impersonate real people');
      expect(prompt).toContain('AI assistant');
    });

    it('includes no-harmful-content rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('No harmful content');
      expect(prompt).toContain('violent');
      expect(prompt).toContain('harmful');
    });

    it('includes no-dangerous-activities rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('No dangerous activities');
      expect(prompt).toContain('weapons');
    });

    it('includes encourage-learning rule', () => {
      const prompt = generateSafetyPrompt();
      expect(prompt).toContain('Encourage learning');
      expect(prompt).toContain('curiosity');
    });

    it('contains all required rule keys', () => {
      expect(SAFETY_RULE_KEYS).toContain('ageAppropriate');
      expect(SAFETY_RULE_KEYS).toContain('noPII');
      expect(SAFETY_RULE_KEYS).toContain('medicalLegalSafety');
      expect(SAFETY_RULE_KEYS).toContain('notRealPerson');
      expect(SAFETY_RULE_KEYS).toContain('noHarmfulContent');
      expect(SAFETY_RULE_KEYS).toContain('noDangerousActivities');
      expect(SAFETY_RULE_KEYS).toContain('encourageLearning');
      expect(SAFETY_RULE_KEYS.length).toBe(7);
    });

    it('is deterministic (same output every call)', () => {
      const a = generateSafetyPrompt();
      const b = generateSafetyPrompt();
      expect(a).toBe(b);
    });
  });

  describe('hasSafetyGuardrails', () => {
    it('returns true for prompt containing safety guardrails', () => {
      const prompt = `You are a test agent.\n\n${generateSafetyPrompt()}`;
      expect(hasSafetyGuardrails(prompt)).toBe(true);
    });

    it('returns false for prompt without safety guardrails', () => {
      expect(hasSafetyGuardrails('You are a test agent.')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasSafetyGuardrails('')).toBe(false);
    });

    it('returns false for partial guardrails (missing some rules)', () => {
      const partial = '## Safety Rules (always enforced)\nAge-appropriate content only';
      expect(hasSafetyGuardrails(partial)).toBe(false);
    });
  });

  describe('integration with agentStore', () => {
    it('safety prompt can be used as system prompt suffix', () => {
      const agentPrompt = 'You are a helpful tutor.';
      const fullPrompt = `${agentPrompt}\n\n${generateSafetyPrompt()}`;

      expect(fullPrompt).toContain('You are a helpful tutor');
      expect(hasSafetyGuardrails(fullPrompt)).toBe(true);
    });
  });
});
