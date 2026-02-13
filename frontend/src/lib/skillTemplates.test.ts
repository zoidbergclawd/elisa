import { describe, it, expect } from 'vitest';
import { SKILL_TEMPLATES, RULE_TEMPLATES } from './skillTemplates';

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
});
