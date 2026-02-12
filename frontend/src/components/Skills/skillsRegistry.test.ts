import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateSkillOptions,
  updateRuleOptions,
  getCurrentSkills,
  getCurrentRules,
} from './skillsRegistry';
import type { Skill, Rule } from './types';

beforeEach(() => {
  updateSkillOptions([]);
  updateRuleOptions([]);
});

describe('skillsRegistry', () => {
  describe('updateSkillOptions / getCurrentSkills', () => {
    it('should return empty array initially', () => {
      expect(getCurrentSkills()).toEqual([]);
    });

    it('should store and retrieve skills', () => {
      const skills: Skill[] = [
        { id: 's1', name: 'Creative', prompt: 'Be creative', category: 'style' },
        { id: 's2', name: 'Fast', prompt: 'Be fast', category: 'agent' },
      ];
      updateSkillOptions(skills);
      expect(getCurrentSkills()).toEqual(skills);
    });

    it('should replace previous skills on update', () => {
      updateSkillOptions([{ id: 's1', name: 'Old', prompt: 'old', category: 'agent' }]);
      const newSkills: Skill[] = [{ id: 's2', name: 'New', prompt: 'new', category: 'feature' }];
      updateSkillOptions(newSkills);
      expect(getCurrentSkills()).toEqual(newSkills);
      expect(getCurrentSkills()).toHaveLength(1);
    });

    it('should clear skills when updated with empty array', () => {
      updateSkillOptions([{ id: 's1', name: 'S', prompt: 'p', category: 'agent' }]);
      updateSkillOptions([]);
      expect(getCurrentSkills()).toEqual([]);
    });
  });

  describe('updateRuleOptions / getCurrentRules', () => {
    it('should return empty array initially', () => {
      expect(getCurrentRules()).toEqual([]);
    });

    it('should store and retrieve rules', () => {
      const rules: Rule[] = [
        { id: 'r1', name: 'Comments', prompt: 'Add comments', trigger: 'always' },
      ];
      updateRuleOptions(rules);
      expect(getCurrentRules()).toEqual(rules);
    });

    it('should replace previous rules on update', () => {
      updateRuleOptions([{ id: 'r1', name: 'Old', prompt: 'old', trigger: 'always' }]);
      const newRules: Rule[] = [{ id: 'r2', name: 'New', prompt: 'new', trigger: 'on_test_fail' }];
      updateRuleOptions(newRules);
      expect(getCurrentRules()).toEqual(newRules);
    });
  });

  describe('independence', () => {
    it('should track skills and rules independently', () => {
      const skills: Skill[] = [{ id: 's1', name: 'S', prompt: 'p', category: 'agent' }];
      const rules: Rule[] = [{ id: 'r1', name: 'R', prompt: 'p', trigger: 'always' }];
      updateSkillOptions(skills);
      updateRuleOptions(rules);
      expect(getCurrentSkills()).toEqual(skills);
      expect(getCurrentRules()).toEqual(rules);

      updateSkillOptions([]);
      expect(getCurrentSkills()).toEqual([]);
      expect(getCurrentRules()).toEqual(rules);
    });
  });
});
