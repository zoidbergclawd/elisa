import { describe, it, expect } from 'vitest';
import { SKILL_FORGE_PROMPT, formatSkillForgePrompt } from '../../prompts/skillForgeAgent.js';

describe('SKILL_FORGE_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SKILL_FORGE_PROMPT).toBe('string');
    expect(SKILL_FORGE_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains required placeholders', () => {
    expect(SKILL_FORGE_PROMPT).toContain('{skill_description}');
    expect(SKILL_FORGE_PROMPT).toContain('{deploy_path}');
  });

  it('references SKILL.md format constraints', () => {
    expect(SKILL_FORGE_PROMPT).toContain('single-line JSON');
    expect(SKILL_FORGE_PROMPT).toContain('frontmatter');
    expect(SKILL_FORGE_PROMPT).toContain('metadata');
  });

  it('includes validation rules', () => {
    expect(SKILL_FORGE_PROMPT).toContain('name');
    expect(SKILL_FORGE_PROMPT).toContain('description');
    expect(SKILL_FORGE_PROMPT).toContain('requires');
  });
});

describe('formatSkillForgePrompt', () => {
  it('replaces all placeholders', () => {
    const result = formatSkillForgePrompt({
      skillDescription: 'summarize GitHub PRs',
      deployPath: '~/.openclaw/skills/',
    });
    expect(result).toContain('summarize GitHub PRs');
    expect(result).toContain('~/.openclaw/skills/');
    expect(result).not.toContain('{skill_description}');
    expect(result).not.toContain('{deploy_path}');
  });

  it('includes content safety section', () => {
    const result = formatSkillForgePrompt({
      skillDescription: 'test',
      deployPath: '/tmp',
    });
    expect(result).toContain('Content Safety');
  });
});
