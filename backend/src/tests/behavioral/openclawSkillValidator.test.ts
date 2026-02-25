import { describe, it, expect } from 'vitest';
import {
  validateSkillFrontmatter,
  parseSkillMd,
  estimateTokenCost,
  type SkillFrontmatter,
  type SkillValidationResult,
} from '../../utils/openclawSkillValidator.js';

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter and body', () => {
    const md = `---
name: test-skill
description: A test skill
user-invocable: true
metadata: {"openclaw":{"emoji":"🔧"}}
---

Instructions for the agent.`;
    const result = parseSkillMd(md);
    expect(result.frontmatter.name).toBe('test-skill');
    expect(result.frontmatter.description).toBe('A test skill');
    expect(result.frontmatter['user-invocable']).toBe(true);
    expect(result.frontmatter.metadata).toEqual({ openclaw: { emoji: '🔧' } });
    expect(result.body).toContain('Instructions for the agent.');
  });

  it('returns error for missing frontmatter delimiters', () => {
    const md = `name: test-skill\nNo frontmatter here.`;
    const result = parseSkillMd(md);
    expect(result.error).toContain('frontmatter');
  });

  it('returns error for empty frontmatter', () => {
    const md = `---\n---\nBody only.`;
    const result = parseSkillMd(md);
    expect(result.error).toContain('empty');
  });
});

describe('validateSkillFrontmatter', () => {
  const valid: SkillFrontmatter = {
    name: 'test-skill',
    description: 'A test skill',
  };

  it('accepts minimal valid frontmatter', () => {
    const result = validateSkillFrontmatter(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing name', () => {
    const result = validateSkillFrontmatter({ description: 'No name' } as SkillFrontmatter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects missing description', () => {
    const result = validateSkillFrontmatter({ name: 'no-desc' } as SkillFrontmatter);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('description'))).toBe(true);
  });

  it('accepts valid metadata with gating requirements', () => {
    const fm: SkillFrontmatter = {
      ...valid,
      metadata: {
        openclaw: {
          requires: { bins: ['gh'], env: ['GITHUB_TOKEN'] },
          primaryEnv: 'GITHUB_TOKEN',
          emoji: '🐙',
        },
      },
    };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  it('rejects metadata where primaryEnv is not in requires.env', () => {
    const fm: SkillFrontmatter = {
      ...valid,
      metadata: {
        openclaw: {
          requires: { env: ['OTHER_TOKEN'] },
          primaryEnv: 'GITHUB_TOKEN',
        },
      },
    };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primaryEnv'))).toBe(true);
  });

  it('accepts user-invocable and disable-model-invocation booleans', () => {
    const fm: SkillFrontmatter = {
      ...valid,
      'user-invocable': false,
      'disable-model-invocation': true,
    };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  it('warns when name contains spaces (should be kebab-case)', () => {
    const fm: SkillFrontmatter = { ...valid, name: 'my skill name' };
    const result = validateSkillFrontmatter(fm);
    expect(result.warnings.some(w => w.includes('kebab'))).toBe(true);
  });

  it('rejects name longer than 200 chars', () => {
    const fm: SkillFrontmatter = { ...valid, name: 'a'.repeat(201) };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
  });

  it('rejects description longer than 2000 chars', () => {
    const fm: SkillFrontmatter = { ...valid, description: 'a'.repeat(2001) };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
  });
});

describe('estimateTokenCost', () => {
  it('estimates token cost for a single skill', () => {
    const cost = estimateTokenCost([
      { name: 'test-skill', description: 'A test', location: '~/.openclaw/skills/test-skill' },
    ]);
    expect(cost.totalChars).toBe(195 + 97 + 'test-skill'.length + 'A test'.length + '~/.openclaw/skills/test-skill'.length);
    expect(cost.estimatedTokens).toBeGreaterThan(0);
  });

  it('estimates token cost for multiple skills', () => {
    const cost = estimateTokenCost([
      { name: 'a', description: 'x', location: '/a' },
      { name: 'b', description: 'y', location: '/b' },
    ]);
    expect(cost.totalChars).toBe(195 + (97 + 1 + 1 + 2) + (97 + 1 + 1 + 2));
    expect(cost.skillCount).toBe(2);
  });
});
