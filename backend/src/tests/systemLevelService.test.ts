import { describe, it, expect } from 'vitest';
import {
  getLevel,
  shouldAutoMatchTests,
  shouldNarrate,
  getNarrationLevel,
  getDAGDetailLevel,
  shouldAutoInviteMeetings,
  getMaxNuggets,
  checkProgression,
  getProgressionProgress,
  LEVEL_PROGRESSION_CRITERIA,
  type BuildRecord,
  type LevelUpEvent,
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

    it('returns true for builder', () => {
      expect(shouldAutoInviteMeetings('builder')).toBe(true);
    });

    it('returns true for architect', () => {
      expect(shouldAutoInviteMeetings('architect')).toBe(true);
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

  // --- LEVEL_PROGRESSION_CRITERIA ---

  describe('LEVEL_PROGRESSION_CRITERIA', () => {
    it('has explorer_to_builder thresholds', () => {
      const c = LEVEL_PROGRESSION_CRITERIA.explorer_to_builder;
      expect(c.min_builds).toBe(3);
      expect(c.min_builds_with_tests).toBe(1);
      expect(c.min_meeting_interactions).toBe(1);
    });

    it('has builder_to_architect thresholds', () => {
      const c = LEVEL_PROGRESSION_CRITERIA.builder_to_architect;
      expect(c.min_builds).toBe(5);
      expect(c.min_builds_with_custom_feedback).toBe(1);
      expect(c.min_high_health_builds).toBe(2);
      expect(c.high_health_threshold).toBe(80);
    });
  });

  // --- checkProgression ---

  describe('checkProgression', () => {
    const baseBuild: BuildRecord = {
      used_behavioral_tests: false,
      used_custom_feedback_loops: false,
      meeting_interactions: 0,
      health_score: null,
    };

    // Explorer -> Builder

    it('stays explorer with empty history', () => {
      expect(checkProgression('explorer', [])).toBe('explorer');
    });

    it('stays explorer with insufficient builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true, meeting_interactions: 1 },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('explorer');
    });

    it('stays explorer when builds exist but no tests used', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, meeting_interactions: 1 },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('explorer');
    });

    it('stays explorer when builds and tests exist but no meeting interactions', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('explorer');
    });

    it('promotes to builder when all explorer criteria met', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true, meeting_interactions: 1 },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('builder');
    });

    it('promotes to builder with meeting interactions spread across builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true },
        { ...baseBuild, meeting_interactions: 1 },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('builder');
    });

    it('promotes to builder with more than minimum builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true, meeting_interactions: 2 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('explorer', history)).toBe('builder');
    });

    // Builder -> Architect

    it('stays builder with empty history', () => {
      expect(checkProgression('builder', [])).toBe('builder');
    });

    it('stays builder with insufficient builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 90 },
        { ...baseBuild, health_score: 85 },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('builder');
    });

    it('stays builder when builds exist but no custom feedback loops', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, health_score: 90 },
        { ...baseBuild, health_score: 85 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('builder');
    });

    it('stays builder when builds and feedback exist but insufficient health scores', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 90 },
        { ...baseBuild, health_score: 70 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('builder');
    });

    it('stays builder when health scores are null', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('builder');
    });

    it('promotes to architect when all builder criteria met', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 90 },
        { ...baseBuild, health_score: 85 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('architect');
    });

    it('promotes to architect with exactly 80 health score (threshold is >=)', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 80 },
        { ...baseBuild, health_score: 80 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('architect');
    });

    it('does not promote with 79 health score (below threshold)', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 80 },
        { ...baseBuild, health_score: 79 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      expect(checkProgression('builder', history)).toBe('builder');
    });

    // Architect stays architect

    it('architect stays architect regardless of history', () => {
      expect(checkProgression('architect', [])).toBe('architect');
      expect(checkProgression('architect', [baseBuild])).toBe('architect');
    });
  });

  // --- getProgressionProgress ---

  describe('getProgressionProgress', () => {
    const baseBuild: BuildRecord = {
      used_behavioral_tests: false,
      used_custom_feedback_loops: false,
      meeting_interactions: 0,
      health_score: null,
    };

    // Architect: no next level

    it('returns no criteria for architect (max level)', () => {
      const result = getProgressionProgress('architect', []);
      expect(result.current_level).toBe('architect');
      expect(result.next_level).toBeNull();
      expect(result.criteria).toEqual([]);
    });

    // Explorer progress

    it('returns explorer progress with empty history', () => {
      const result = getProgressionProgress('explorer', []);
      expect(result.current_level).toBe('explorer');
      expect(result.next_level).toBe('builder');
      expect(result.criteria).toHaveLength(3);
      expect(result.criteria[0]).toEqual({ name: 'Complete builds', met: false, progress: '0/3' });
      expect(result.criteria[1]).toEqual({ name: 'Use behavioral tests', met: false, progress: '0/1' });
      expect(result.criteria[2]).toEqual({ name: 'Interact with Agent Meetings', met: false, progress: '0/1' });
    });

    it('returns explorer progress with partial completion', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true },
        { ...baseBuild },
      ];
      const result = getProgressionProgress('explorer', history);
      expect(result.criteria[0]).toEqual({ name: 'Complete builds', met: false, progress: '2/3' });
      expect(result.criteria[1]).toEqual({ name: 'Use behavioral tests', met: true, progress: '1/1' });
      expect(result.criteria[2]).toEqual({ name: 'Interact with Agent Meetings', met: false, progress: '0/1' });
    });

    it('returns explorer progress with all criteria met', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_behavioral_tests: true, meeting_interactions: 1 },
        { ...baseBuild },
        { ...baseBuild },
      ];
      const result = getProgressionProgress('explorer', history);
      expect(result.criteria.every(c => c.met)).toBe(true);
      expect(result.criteria[0].progress).toBe('3/3');
    });

    it('counts meeting interactions across all builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, meeting_interactions: 2 },
        { ...baseBuild, meeting_interactions: 3 },
      ];
      const result = getProgressionProgress('explorer', history);
      expect(result.criteria[2].progress).toBe('5/1');
      expect(result.criteria[2].met).toBe(true);
    });

    // Builder progress

    it('returns builder progress with empty history', () => {
      const result = getProgressionProgress('builder', []);
      expect(result.current_level).toBe('builder');
      expect(result.next_level).toBe('architect');
      expect(result.criteria).toHaveLength(3);
      expect(result.criteria[0]).toEqual({ name: 'Complete builds', met: false, progress: '0/5' });
      expect(result.criteria[1]).toEqual({ name: 'Use custom feedback loops', met: false, progress: '0/1' });
      expect(result.criteria[2]).toEqual({ name: 'Achieve 80%+ health scores', met: false, progress: '0/2' });
    });

    it('returns builder progress with partial completion', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 90 },
        { ...baseBuild, health_score: 60 },
        { ...baseBuild },
      ];
      const result = getProgressionProgress('builder', history);
      expect(result.criteria[0]).toEqual({ name: 'Complete builds', met: false, progress: '3/5' });
      expect(result.criteria[1]).toEqual({ name: 'Use custom feedback loops', met: true, progress: '1/1' });
      expect(result.criteria[2]).toEqual({ name: 'Achieve 80%+ health scores', met: false, progress: '1/2' });
    });

    it('returns builder progress with all criteria met', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: 90 },
        { ...baseBuild, health_score: 85 },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      const result = getProgressionProgress('builder', history);
      expect(result.criteria.every(c => c.met)).toBe(true);
    });

    it('does not count null health scores toward high health builds', () => {
      const history: BuildRecord[] = [
        { ...baseBuild, used_custom_feedback_loops: true, health_score: null },
        { ...baseBuild, health_score: null },
        { ...baseBuild },
        { ...baseBuild },
        { ...baseBuild },
      ];
      const result = getProgressionProgress('builder', history);
      expect(result.criteria[2]).toEqual({ name: 'Achieve 80%+ health scores', met: false, progress: '0/2' });
    });
  });

  // --- LevelUpEvent type ---

  describe('LevelUpEvent interface', () => {
    it('can construct a valid level_up event', () => {
      const event: LevelUpEvent = {
        type: 'level_up',
        from_level: 'explorer',
        to_level: 'builder',
      };
      expect(event.type).toBe('level_up');
      expect(event.from_level).toBe('explorer');
      expect(event.to_level).toBe('builder');
    });
  });
});
