import { describe, it, expect } from 'vitest';
import { parseBuildInput } from '../commands/build.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('parseBuildInput', () => {
  it('reads a NuggetSpec from a --spec file', () => {
    const tmpFile = path.join(os.tmpdir(), 'test-spec.json');
    const spec = {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    };
    fs.writeFileSync(tmpFile, JSON.stringify(spec));

    const result = parseBuildInput(undefined, tmpFile) as any;
    expect(result.nugget.goal).toBe('test');

    fs.unlinkSync(tmpFile);
  });

  it('throws if neither description nor spec is provided', () => {
    expect(() => parseBuildInput(undefined, undefined)).toThrow();
  });

  it('returns a NuggetSpec shell from a description string', () => {
    const result = parseBuildInput('Build a REST API for bookmarks', undefined) as any;
    expect(result.nugget.goal).toBe('Build a REST API for bookmarks');
    expect(result.nugget.description).toBe('Build a REST API for bookmarks');
  });

  it('includes a builder agent in the description-generated spec', () => {
    const result = parseBuildInput('My project', undefined) as any;
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].role).toBe('builder');
  });

  it('enables testing in the description-generated spec', () => {
    const result = parseBuildInput('My project', undefined) as any;
    expect(result.workflow.testing_enabled).toBe(true);
  });
});
