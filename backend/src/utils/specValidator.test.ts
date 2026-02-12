import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from './specValidator.js';

describe('NuggetSpecSchema portal config validation', () => {
  const basePortal = {
    name: 'TestPortal',
    description: 'A test portal',
    mechanism: 'mcp',
    capabilities: [],
    interactions: [],
  };

  it('accepts valid mcpConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'abc123' },
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects mcpConfig with shell metacharacters in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'npx',
            args: ['server.js; rm -rf /'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with backtick command substitution in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['`whoami`'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with $() substitution in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['$(cat /etc/passwd)'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with unknown extra fields (strict mode)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['server.js'],
            evil: 'injection',
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid cliConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mechanism: 'cli',
          cliConfig: {
            command: 'python3',
            args: ['script.py', '--flag'],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects cliConfig with shell metacharacters in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mechanism: 'cli',
          cliConfig: {
            command: 'python3',
            args: ['script.py && rm -rf /'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid serialConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mechanism: 'serial',
          serialConfig: {
            port: 'COM3',
            baudRate: 115200,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects portal with unrecognized config fields', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          arbitraryField: 'should-not-be-here',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig without required command field', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            args: ['server.js'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
