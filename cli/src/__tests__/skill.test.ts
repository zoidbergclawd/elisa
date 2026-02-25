import { describe, it, expect } from 'vitest';
import { createProgram } from '../cli.js';
import { parseSkillInput } from '../commands/skill.js';
import os from 'node:os';
import path from 'node:path';

describe('CLI skill command registration', () => {
  it('has a "skill" command', () => {
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === 'skill');
    expect(skillCmd).toBeDefined();
  });

  it('skill command has --deploy option', () => {
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === 'skill');
    const deployOpt = skillCmd?.options.find(o => o.long === '--deploy');
    expect(deployOpt).toBeDefined();
  });

  it('skill command has --json option', () => {
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === 'skill');
    const jsonOpt = skillCmd?.options.find(o => o.long === '--json');
    expect(jsonOpt).toBeDefined();
  });
});

describe('parseSkillInput', () => {
  it('creates a NuggetSpec with type openclaw-skill', () => {
    const spec = parseSkillInput('summarize GitHub PRs');
    expect(spec.nugget.type).toBe('openclaw-skill');
    expect(spec.nugget.goal).toContain('summarize GitHub PRs');
  });

  it('includes the description in the nugget goal', () => {
    const spec = parseSkillInput('translate messages to Spanish');
    expect(spec.nugget.goal).toContain('translate messages to Spanish');
    expect(spec.nugget.description).toContain('translate messages to Spanish');
  });

  it('sets default deploy path to ~/.openclaw/skills/', () => {
    const spec = parseSkillInput('test skill');
    const expected = path.join(os.homedir(), '.openclaw', 'skills');
    expect(spec.openclawConfig?.deployPath).toBe(expected);
  });

  it('uses custom deploy path when provided', () => {
    const spec = parseSkillInput('test skill', '/custom/path');
    expect(spec.openclawConfig?.deployPath).toBe('/custom/path');
  });

  it('throws if description is empty', () => {
    expect(() => parseSkillInput('')).toThrow();
  });
});
