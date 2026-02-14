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

describe('NuggetSpecSchema basic validation', () => {
  it('accepts minimal valid spec', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = NuggetSpecSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects goal exceeding max length', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'x'.repeat(2001) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields at root level (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
      unknownField: 'should-be-rejected',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in nugget object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game', extraProp: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in agents array items (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      agents: [{ name: 'builder', role: 'builder', evil: 'injection' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in requirements array items (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      requirements: [{ type: 'functional', description: 'test', extra: 'bad' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in style object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      style: { visual: 'modern', unknownStyleProp: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in deployment object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'web', badField: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts auto_flash in deployment', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'esp32', auto_flash: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields in workflow object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { human_gates: ['before_deploy'], hacked: true },
    });
    expect(result.success).toBe(false);
  });

  it('accepts review_enabled and testing_enabled in workflow', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { review_enabled: true, testing_enabled: false, human_gates: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields in capability schema (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test',
        description: 'desc',
        mechanism: 'serial',
        capabilities: [{ id: 'cap', name: 'Cap', extraCap: 'bad' }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in interaction schema (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{ type: 'tell', capabilityId: 'cap', extraField: true }],
      }],
    });
    expect(result.success).toBe(false);
  });
});

describe('portal interaction params', () => {
  it('accepts interaction without params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{ type: 'tell', capabilityId: 'led-on' }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with string params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { color: 'red', message: 'hello' },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with number params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'mcp',
        interactions: [{
          type: 'ask',
          capabilityId: 'read-temp',
          params: { interval: 5, threshold: 25.5 },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with boolean params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'cli',
        interactions: [{
          type: 'tell',
          capabilityId: 'toggle',
          params: { enabled: true, verbose: false },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with mixed param types', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Mixed Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { color: 'blue', brightness: 80, blinking: true },
        }],
      }],
    });
    expect(result.success).toBe(true);
    const parsed = result.data!;
    const params = parsed.portals![0].interactions![0].params!;
    expect(params.color).toBe('blue');
    expect(params.brightness).toBe(80);
    expect(params.blinking).toBe(true);
  });

  it('accepts empty params object', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: {},
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects param value exceeding max string length', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { data: 'x'.repeat(2001) },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects param key exceeding max length', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { ['k'.repeat(201)]: 'value' },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-primitive param values (object)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { nested: { bad: true } },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });
});
