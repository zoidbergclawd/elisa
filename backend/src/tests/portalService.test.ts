/** Tests for portalService.ts -- command allowlist, argument sanitization,
 * env validation, adapter lifecycle, and PortalService orchestration.
 *
 * Security-critical: validates that only allowed commands pass,
 * shell metacharacters are rejected, and control chars in env are blocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCommand,
  validateArgs,
  validateEnv,
  ALLOWED_COMMANDS,
  McpPortalAdapter,
  CliPortalAdapter,
  PortalService,
} from '../services/portalService.js';
import type { PortalSpec, PortalCapability } from '../services/portalService.js';

// ============================================================
// validateCommand()
// ============================================================

describe('validateCommand()', () => {
  it('accepts every command in the ALLOWED_COMMANDS set', () => {
    for (const cmd of ALLOWED_COMMANDS) {
      expect(() => validateCommand(cmd)).not.toThrow();
    }
  });

  it('rejects commands not in the allowlist', () => {
    expect(() => validateCommand('bash')).toThrow('not allowed');
    expect(() => validateCommand('sh')).toThrow('not allowed');
    expect(() => validateCommand('rm')).toThrow('not allowed');
    expect(() => validateCommand('curl')).toThrow('not allowed');
    expect(() => validateCommand('cat')).toThrow('not allowed');
  });

  it('throws on empty string', () => {
    expect(() => validateCommand('')).toThrow('non-empty string');
  });

  it('throws on non-string input', () => {
    expect(() => validateCommand(null as any)).toThrow('non-empty string');
    expect(() => validateCommand(undefined as any)).toThrow('non-empty string');
    expect(() => validateCommand(42 as any)).toThrow('non-empty string');
  });

  it('strips path prefixes and accepts valid commands', () => {
    expect(() => validateCommand('/usr/bin/node')).not.toThrow();
    expect(() => validateCommand('/usr/local/bin/python3')).not.toThrow();
    expect(() => validateCommand('C:\\Program Files\\node')).not.toThrow();
  });

  it('strips .exe/.cmd/.bat suffixes on Windows-style commands', () => {
    expect(() => validateCommand('node.exe')).not.toThrow();
    expect(() => validateCommand('python.cmd')).not.toThrow();
    expect(() => validateCommand('npx.bat')).not.toThrow();
  });

  it('rejects path-prefixed disallowed commands', () => {
    expect(() => validateCommand('/usr/bin/bash')).toThrow('not allowed');
    expect(() => validateCommand('/bin/sh')).toThrow('not allowed');
  });
});

// ============================================================
// validateArgs()
// ============================================================

describe('validateArgs()', () => {
  it('returns undefined for undefined/null input', () => {
    expect(validateArgs(undefined)).toBeUndefined();
    expect(validateArgs(null)).toBeUndefined();
  });

  it('accepts an array of clean strings', () => {
    const args = ['--port', '3000', 'server.js'];
    expect(validateArgs(args)).toEqual(args);
  });

  it('throws when args is not an array', () => {
    expect(() => validateArgs('not-an-array')).toThrow('must be an array');
    expect(() => validateArgs(42)).toThrow('must be an array');
    expect(() => validateArgs({})).toThrow('must be an array');
  });

  it('throws when an arg is not a string', () => {
    expect(() => validateArgs(['valid', 42])).toThrow('must be a string');
    expect(() => validateArgs([null])).toThrow('must be a string');
  });

  it('rejects args containing shell metacharacters', () => {
    const dangerous = [
      'foo;bar',      // semicolon
      'foo|bar',      // pipe
      'foo&bar',      // ampersand
      'foo`cmd`',     // backtick
      'foo$(cmd)',     // dollar-paren
      'foo{a,b}',     // braces
      'foo>out',      // redirect
      'foo<in',       // redirect
      "foo'bar",      // single quote
      'foo"bar',      // double quote
      'foo\\bar',     // backslash
      'foo\nbar',     // newline
      'foo\rbar',     // carriage return
      'foo!bar',      // exclamation
    ];
    for (const arg of dangerous) {
      expect(() => validateArgs([arg])).toThrow('forbidden shell metacharacters');
    }
  });

  it('accepts args with safe special characters', () => {
    const safe = ['--flag=value', '-p', '3000', 'path/to/file', 'http://localhost'];
    expect(validateArgs(safe)).toEqual(safe);
  });
});

// ============================================================
// validateEnv()
// ============================================================

describe('validateEnv()', () => {
  it('returns undefined for undefined/null input', () => {
    expect(validateEnv(undefined)).toBeUndefined();
    expect(validateEnv(null)).toBeUndefined();
  });

  it('accepts a plain object with string key-value pairs', () => {
    const env = { NODE_ENV: 'production', PORT: '3000' };
    expect(validateEnv(env)).toEqual(env);
  });

  it('throws when env is not a plain object', () => {
    expect(() => validateEnv('string')).toThrow('must be a plain object');
    expect(() => validateEnv([1, 2, 3])).toThrow('must be a plain object');
  });

  it('throws when env values are not strings', () => {
    expect(() => validateEnv({ PORT: 3000 })).toThrow('string value');
  });

  it('rejects env keys with shell metacharacters', () => {
    expect(() => validateEnv({ 'KEY;DROP': 'value' })).toThrow('forbidden characters');
    expect(() => validateEnv({ 'KEY|PIPE': 'value' })).toThrow('forbidden characters');
  });

  it('rejects env values with control characters', () => {
    expect(() => validateEnv({ KEY: 'val\x00ue' })).toThrow('control characters');
    expect(() => validateEnv({ KEY: 'val\x07ue' })).toThrow('control characters');
    expect(() => validateEnv({ KEY: 'val\x1fue' })).toThrow('control characters');
  });

  it('allows env values with tab character (not in control char range)', () => {
    // Tab (\x09) is excluded from the control char regex
    expect(validateEnv({ KEY: 'val\tue' })).toEqual({ KEY: 'val\tue' });
  });
});

// ============================================================
// McpPortalAdapter
// ============================================================

describe('McpPortalAdapter', () => {
  const testCapabilities: PortalCapability[] = [
    { id: 'cap1', name: 'Test Cap', kind: 'action', description: 'A test capability' },
  ];

  it('initializes with a valid command', async () => {
    const adapter = new McpPortalAdapter(testCapabilities);
    await adapter.initialize({ command: 'node', args: ['server.js'] });
    const config = adapter.getMcpServerConfig();
    expect(config.command).toBe('node');
    expect(config.args).toEqual(['server.js']);
  });

  it('rejects initialization with disallowed command', async () => {
    const adapter = new McpPortalAdapter(testCapabilities);
    await expect(adapter.initialize({ command: 'bash', args: ['-c', 'echo hi'] }))
      .rejects.toThrow('not allowed');
  });

  it('returns capabilities set at construction', () => {
    const adapter = new McpPortalAdapter(testCapabilities);
    expect(adapter.getCapabilities()).toEqual(testCapabilities);
  });

  it('validates env during initialization', async () => {
    const adapter = new McpPortalAdapter(testCapabilities);
    await expect(
      adapter.initialize({ command: 'node', env: { KEY: 'val\x00ue' } }),
    ).rejects.toThrow('control characters');
  });

  it('teardown is a no-op', async () => {
    const adapter = new McpPortalAdapter(testCapabilities);
    await adapter.initialize({ command: 'node' });
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });
});

// ============================================================
// CliPortalAdapter
// ============================================================

describe('CliPortalAdapter', () => {
  const testCapabilities: PortalCapability[] = [
    { id: 'cap1', name: 'Run Script', kind: 'action', description: 'Runs a script' },
  ];

  it('initializes with a valid command and args', async () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    await adapter.initialize({ command: 'python3', args: ['script.py', '--verbose'] });
    expect(adapter.getCommand()).toBe('python3');
    expect(adapter.getArgs()).toEqual(['script.py', '--verbose']);
  });

  it('rejects initialization with disallowed command', async () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    await expect(adapter.initialize({ command: 'rm' })).rejects.toThrow('not allowed');
  });

  it('returns capabilities set at construction', () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    expect(adapter.getCapabilities()).toEqual(testCapabilities);
  });

  it('defaults args to empty array when not provided', async () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    await adapter.initialize({ command: 'node' });
    expect(adapter.getArgs()).toEqual([]);
  });

  it('execute returns failure when no command is configured', async () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    // Skip initialize -- command remains empty
    const result = await adapter.execute('/tmp');
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('No command configured');
  });

  it('teardown is a no-op', async () => {
    const adapter = new CliPortalAdapter(testCapabilities);
    await adapter.initialize({ command: 'node' });
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });
});

// ============================================================
// PortalService
// ============================================================

describe('PortalService', () => {
  function makePortalSpec(overrides: Partial<PortalSpec> = {}): PortalSpec {
    return {
      id: 'portal-1',
      name: 'Test Portal',
      description: 'A test portal',
      mechanism: 'cli',
      capabilities: [
        { id: 'cap1', name: 'Action', kind: 'action', description: 'Does things' },
      ],
      interactions: [],
      cliConfig: { command: 'node', args: ['index.js'] },
      ...overrides,
    };
  }

  beforeEach(() => {
    // Fresh service for each test
  });

  it('initializes portals from specs', async () => {
    const service = new PortalService();
    await service.initializePortals([makePortalSpec()]);
    const runtime = service.getRuntime('portal-1');
    expect(runtime).toBeDefined();
    expect(runtime!.status).toBe('ready');
    expect(runtime!.name).toBe('Test Portal');
    await service.teardownAll();
  });

  it('returns undefined for unknown portal ID', () => {
    const service = new PortalService();
    expect(service.getRuntime('nonexistent')).toBeUndefined();
  });

  it('getAllRuntimes returns all initialized portals', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({ id: 'p1', name: 'Portal 1' }),
      makePortalSpec({ id: 'p2', name: 'Portal 2' }),
    ]);
    const runtimes = service.getAllRuntimes();
    expect(runtimes).toHaveLength(2);
    await service.teardownAll();
  });

  it('handles MCP mechanism portals', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({
        id: 'mcp-1',
        mechanism: 'mcp',
        mcpConfig: { command: 'npx', args: ['@modelcontextprotocol/server'] },
      }),
    ]);
    const servers = service.getMcpServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('Test Portal');
    expect(servers[0].command).toBe('npx');
    await service.teardownAll();
  });

  it('auto-detects mechanism as mcp when mcpConfig is present', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({
        id: 'auto-1',
        mechanism: 'auto',
        mcpConfig: { command: 'node', args: ['mcp-server.js'] },
      }),
    ]);
    const runtime = service.getRuntime('auto-1');
    expect(runtime!.mechanism).toBe('mcp');
    await service.teardownAll();
  });

  it('auto-detects mechanism as cli when cliConfig is present', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({
        id: 'auto-2',
        mechanism: 'auto',
        mcpConfig: undefined,
        cliConfig: { command: 'python3', args: ['script.py'] },
      }),
    ]);
    const runtime = service.getRuntime('auto-2');
    expect(runtime!.mechanism).toBe('cli');
    await service.teardownAll();
  });

  it('auto-detects mechanism as cli when neither config is present and throws on empty command', async () => {
    const service = new PortalService();
    // With no cliConfig, the CLI adapter gets {} which has no command -> validateCommand throws
    await expect(
      service.initializePortals([
        makePortalSpec({
          id: 'auto-3',
          mechanism: 'auto',
          mcpConfig: undefined,
          cliConfig: undefined,
        }),
      ]),
    ).rejects.toThrow('non-empty string');
    await service.teardownAll();
  });

  it('getCliPortals returns only CLI adapter portals', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({ id: 'cli-1', mechanism: 'cli' }),
      makePortalSpec({
        id: 'mcp-1',
        mechanism: 'mcp',
        mcpConfig: { command: 'node', args: ['server.js'] },
      }),
    ]);
    const cliPortals = service.getCliPortals();
    expect(cliPortals).toHaveLength(1);
    expect(cliPortals[0].name).toBe('Test Portal');
    await service.teardownAll();
  });

  it('getMcpServers rejects MCP portal with empty config (no command)', async () => {
    const service = new PortalService();
    // Empty mcpConfig means command is '' -> validateCommand throws
    await expect(
      service.initializePortals([
        makePortalSpec({
          id: 'mcp-empty',
          mechanism: 'mcp',
          mcpConfig: {},
        }),
      ]),
    ).rejects.toThrow('non-empty string');
    await service.teardownAll();
  });

  it('teardownAll clears all runtimes', async () => {
    const service = new PortalService();
    await service.initializePortals([makePortalSpec()]);
    expect(service.getAllRuntimes()).toHaveLength(1);
    await service.teardownAll();
    expect(service.getAllRuntimes()).toHaveLength(0);
  });

  it('teardownAll tolerates adapter teardown errors', async () => {
    const service = new PortalService();
    await service.initializePortals([makePortalSpec()]);
    // Sabotage the adapter's teardown
    const runtime = service.getRuntime('portal-1')!;
    runtime.adapter.teardown = vi.fn().mockRejectedValue(new Error('teardown failed'));
    // Should not throw
    await expect(service.teardownAll()).resolves.toBeUndefined();
    expect(service.getAllRuntimes()).toHaveLength(0);
  });

  it('falls back to CLI adapter for unknown mechanism', async () => {
    const service = new PortalService();
    await service.initializePortals([
      makePortalSpec({
        id: 'unknown-1',
        mechanism: 'grpc' as any,
        cliConfig: { command: 'node', args: ['server.js'] },
      }),
    ]);
    const runtime = service.getRuntime('unknown-1');
    expect(runtime).toBeDefined();
    expect(runtime!.status).toBe('ready');
    await service.teardownAll();
  });
});
