import { describe, it, expect } from 'vitest';
import { ALLOWED_COMMANDS, validateCommand } from '../../services/portalService.js';

describe('ALLOWED_COMMANDS includes OpenClaw tools', () => {
  it('includes openclaw', () => {
    expect(ALLOWED_COMMANDS.has('openclaw')).toBe(true);
  });

  it('includes clawhub', () => {
    expect(ALLOWED_COMMANDS.has('clawhub')).toBe(true);
  });

  it('validateCommand accepts openclaw', () => {
    expect(() => validateCommand('openclaw')).not.toThrow();
  });

  it('validateCommand accepts clawhub', () => {
    expect(() => validateCommand('clawhub')).not.toThrow();
  });

  it('still includes all original commands', () => {
    for (const cmd of ['node', 'npx', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun', 'bunx', 'gcloud', 'firebase']) {
      expect(ALLOWED_COMMANDS.has(cmd)).toBe(true);
    }
  });
});
