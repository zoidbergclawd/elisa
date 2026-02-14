/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { SKILL_TEMPLATES, RULE_TEMPLATES } from './skillTemplates';
import { interpretSkillWorkspace } from '../components/BlockCanvas/skillInterpreter';

describe('skillTemplates', () => {
  it('exports non-empty skill templates array', () => {
    expect(SKILL_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('exports non-empty rule templates array', () => {
    expect(RULE_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('all skill template IDs are unique', () => {
    const ids = SKILL_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all rule template IDs are unique', () => {
    const ids = RULE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all skill template names are unique', () => {
    const names = SKILL_TEMPLATES.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all rule template names are unique', () => {
    const names = RULE_TEMPLATES.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all skill templates have valid categories', () => {
    const valid = new Set(['agent', 'feature', 'style', 'composite']);
    for (const tmpl of SKILL_TEMPLATES) {
      expect(valid.has(tmpl.category), `${tmpl.name} has invalid category: ${tmpl.category}`).toBe(true);
    }
  });

  it('all rule templates have valid triggers', () => {
    const valid = new Set(['always', 'on_task_complete', 'on_test_fail', 'before_deploy']);
    for (const tmpl of RULE_TEMPLATES) {
      expect(valid.has(tmpl.trigger), `${tmpl.name} has invalid trigger: ${tmpl.trigger}`).toBe(true);
    }
  });

  it('all templates have non-empty required fields', () => {
    for (const tmpl of SKILL_TEMPLATES) {
      expect(tmpl.id).toBeTruthy();
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.prompt).toBeTruthy();
      expect(tmpl.description).toBeTruthy();
      expect(tmpl.tags.length).toBeGreaterThan(0);
    }
    for (const tmpl of RULE_TEMPLATES) {
      expect(tmpl.id).toBeTruthy();
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.prompt).toBeTruthy();
      expect(tmpl.description).toBeTruthy();
      expect(tmpl.tags.length).toBeGreaterThan(0);
    }
  });

  it('all template IDs use tmpl- prefix', () => {
    for (const tmpl of SKILL_TEMPLATES) {
      expect(tmpl.id.startsWith('tmpl-'), `Skill ${tmpl.name} ID missing tmpl- prefix`).toBe(true);
    }
    for (const tmpl of RULE_TEMPLATES) {
      expect(tmpl.id.startsWith('tmpl-'), `Rule ${tmpl.name} ID missing tmpl- prefix`).toBe(true);
    }
  });

  describe('composite templates', () => {
    const compositeTemplates = SKILL_TEMPLATES.filter(t => t.category === 'composite');

    it('has at least two composite templates', () => {
      expect(compositeTemplates.length).toBeGreaterThanOrEqual(2);
    });

    it('all composite templates have workspace JSON', () => {
      for (const tmpl of compositeTemplates) {
        expect(tmpl.workspace, `${tmpl.name} missing workspace`).toBeDefined();
      }
    });

    it('all composite template workspaces have valid block structure', () => {
      for (const tmpl of compositeTemplates) {
        const ws = tmpl.workspace as any;
        expect(ws.blocks, `${tmpl.name} missing blocks`).toBeDefined();
        expect(ws.blocks.blocks, `${tmpl.name} missing blocks.blocks`).toBeDefined();
        expect(Array.isArray(ws.blocks.blocks), `${tmpl.name} blocks.blocks not an array`).toBe(true);
        expect(ws.blocks.blocks.length, `${tmpl.name} blocks.blocks is empty`).toBeGreaterThan(0);
      }
    });

    it('all composite template workspaces start with skill_flow_start', () => {
      for (const tmpl of compositeTemplates) {
        const ws = tmpl.workspace as any;
        const topBlock = ws.blocks.blocks[0];
        expect(topBlock.type, `${tmpl.name} first block is not skill_flow_start`).toBe('skill_flow_start');
      }
    });

    it('all composite template workspaces produce non-empty skill plans', () => {
      for (const tmpl of compositeTemplates) {
        const plan = interpretSkillWorkspace(
          tmpl.workspace as Record<string, unknown>,
          tmpl.id,
          tmpl.name,
        );
        expect(plan.steps.length, `${tmpl.name} produced no steps`).toBeGreaterThan(0);
      }
    });

    it('presentation builder template asks for topic and format', () => {
      const pres = compositeTemplates.find(t => t.id === 'tmpl-presentation-builder');
      expect(pres).toBeDefined();
      const plan = interpretSkillWorkspace(pres!.workspace as Record<string, unknown>, pres!.id, pres!.name);
      const askSteps = plan.steps.filter(s => s.type === 'ask_user');
      expect(askSteps.length).toBe(2);
      expect(askSteps[0].storeAs).toBe('topic');
      expect(askSteps[1].storeAs).toBe('format');
    });

    it('code review checklist template asks for focus area', () => {
      const review = compositeTemplates.find(t => t.id === 'tmpl-code-review-checklist');
      expect(review).toBeDefined();
      const plan = interpretSkillWorkspace(review!.workspace as Record<string, unknown>, review!.id, review!.name);
      const askSteps = plan.steps.filter(s => s.type === 'ask_user');
      expect(askSteps.length).toBe(1);
      expect(askSteps[0].storeAs).toBe('focus');
    });
  });
});
