import { describe, it, expect } from 'vitest';
import {
  getLevel,
  shouldAutoMatchTests,
  shouldNarrate,
  getNarrationLevel,
  getDAGDetailLevel,
  shouldAutoInviteMeetings,
  getMaxNuggets,
} from '../services/systemLevelService.js';

describe('systemLevelService', () => {
  // --- getLevel ---

  describe('getLevel', () => {
    it('defaults to explorer when no workflow', () => {
      expect(getLevel({})).toBe('explorer');
    });

    it('defaults to explorer when workflow has no system_level', () => {
      expect(getLevel({ workflow: {} })).toBe('explorer');
    });

    it('defaults to explorer for unknown value', () => {
      expect(getLevel({ workflow: { system_level: 'guru' } })).toBe('explorer');
    });

    it('returns explorer when set', () => {
      expect(getLevel({ workflow: { system_level: 'explorer' } })).toBe('explorer');
    });

    it('returns builder when set', () => {
      expect(getLevel({ workflow: { system_level: 'builder' } })).toBe('builder');
    });

    it('returns architect when set', () => {
      expect(getLevel({ workflow: { system_level: 'architect' } })).toBe('architect');
    });
  });

  // --- shouldAutoMatchTests ---

  describe('shouldAutoMatchTests', () => {
    it('returns true for explorer', () => {
      expect(shouldAutoMatchTests('explorer')).toBe(true);
    });

    it('returns false for builder', () => {
      expect(shouldAutoMatchTests('builder')).toBe(false);
    });

    it('returns false for architect', () => {
      expect(shouldAutoMatchTests('architect')).toBe(false);
    });
  });

  // --- getNarrationLevel ---

  describe('getNarrationLevel', () => {
    it('returns full for explorer', () => {
      expect(getNarrationLevel('explorer')).toBe('full');
    });

    it('returns selective for builder', () => {
      expect(getNarrationLevel('builder')).toBe('selective');
    });

    it('returns minimal for architect', () => {
      expect(getNarrationLevel('architect')).toBe('minimal');
    });
  });

  // --- shouldNarrate ---

  describe('shouldNarrate', () => {
    it('explorer narrates everything regardless of importance', () => {
      expect(shouldNarrate('explorer', 'low')).toBe(true);
      expect(shouldNarrate('explorer', 'medium')).toBe(true);
      expect(shouldNarrate('explorer', 'high')).toBe(true);
    });

    it('builder narrates medium and high importance only', () => {
      expect(shouldNarrate('builder', 'low')).toBe(false);
      expect(shouldNarrate('builder', 'medium')).toBe(true);
      expect(shouldNarrate('builder', 'high')).toBe(true);
    });

    it('architect narrates only high importance', () => {
      expect(shouldNarrate('architect', 'low')).toBe(false);
      expect(shouldNarrate('architect', 'medium')).toBe(false);
      expect(shouldNarrate('architect', 'high')).toBe(true);
    });

    it('defaults importance to medium when not specified', () => {
      expect(shouldNarrate('explorer')).toBe(true);
      expect(shouldNarrate('builder')).toBe(true);
      expect(shouldNarrate('architect')).toBe(false);
    });
  });

  // --- getDAGDetailLevel ---

  describe('getDAGDetailLevel', () => {
    it('returns agent for explorer', () => {
      expect(getDAGDetailLevel('explorer')).toBe('agent');
    });

    it('returns task for builder', () => {
      expect(getDAGDetailLevel('builder')).toBe('task');
    });

    it('returns task for architect', () => {
      expect(getDAGDetailLevel('architect')).toBe('task');
    });
  });

  // --- shouldAutoInviteMeetings ---

  describe('shouldAutoInviteMeetings', () => {
    it('returns true for explorer', () => {
      expect(shouldAutoInviteMeetings('explorer')).toBe(true);
    });

    it('returns false for builder', () => {
      expect(shouldAutoInviteMeetings('builder')).toBe(false);
    });

    it('returns false for architect', () => {
      expect(shouldAutoInviteMeetings('architect')).toBe(false);
    });
  });

  // --- getMaxNuggets ---

  describe('getMaxNuggets', () => {
    it('returns 1 for explorer', () => {
      expect(getMaxNuggets('explorer')).toBe(1);
    });

    it('returns 3 for builder', () => {
      expect(getMaxNuggets('builder')).toBe(3);
    });

    it('returns Infinity for architect', () => {
      expect(getMaxNuggets('architect')).toBe(Infinity);
    });
  });
});
