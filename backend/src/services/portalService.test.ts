import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  validateArgs,
  validateEnv,
  ALLOWED_COMMANDS,
  McpPortalAdapter,
  CliPortalAdapter,
  PortalService,
} from './portalService.js';

// ── validateCommand ─────────────────────────────────────────────────

describe('validateCommand', () => {
  it('accepts all allowed commands', () => {
    for (const cmd of ALLOWED_COMMANDS) {
      expect(() => validateCommand(cmd)).not.toThrow();
    }
  });

  it('accepts allowed commands with .exe suffix', () => {
    expect(() => validateCommand('node.exe')).not.toThrow();
    expect(() => validateCommand('python.cmd')).not.toThrow();
  });

  it('accepts allowed commands with path prefix', () => {
    expect(() => validateCommand('/usr/bin/node')).not.toThrow();
    expect(() => validateCommand('C:\\Program Files\\node')).not.toThrow();
  });

  it('rejects empty command', () => {
    expect(() => validateCommand('')).toThrow('non-empty string');
  });

  it('rejects arbitrary commands (command injection)', () => {
    expect(() => validateCommand('bash')).toThrow('not allowed');
    expect(() => validateCommand('sh')).toThrow('not allowed');
    expect(() => validateCommand('cmd')).toThrow('not allowed');
    expect(() => validateCommand('powershell')).toThrow('not allowed');
    expect(() => validateCommand('curl')).toThrow('not allowed');
    expect(() => validateCommand('rm')).toThrow('not allowed');
    expect(() => validateCommand('/bin/sh')).toThrow('not allowed');
  });

  it('rejects commands that try to bypass via path traversal', () => {
    expect(() => validateCommand('/tmp/../bin/bash')).toThrow('not allowed');
    expect(() => validateCommand('../../etc/passwd')).toThrow('not allowed');
  });
});

// ── validateArgs ────────────────────────────────────────────────────

describe('validateArgs', () => {
  it('returns undefined for undefined/null', () => {
    expect(validateArgs(undefined)).toBeUndefined();
    expect(validateArgs(null)).toBeUndefined();
  });

  it('accepts clean args', () => {
    expect(validateArgs(['server.js', '--port', '3000'])).toEqual([
      'server.js',
      '--port',
      '3000',
    ]);
  });

  it('rejects non-array input', () => {
    expect(() => validateArgs('not-an-array')).toThrow('array of strings');
  });

  it('rejects non-string elements', () => {
    expect(() => validateArgs([123])).toThrow('must be a string');
  });

  it('rejects args with semicolons (command chaining)', () => {
    expect(() => validateArgs(['server.js; rm -rf /'])).toThrow(
      'shell metacharacters',
    );
  });

  it('rejects args with pipe (command piping)', () => {
    expect(() => validateArgs(['file.js | cat /etc/passwd'])).toThrow(
      'shell metacharacters',
    );
  });

  it('rejects args with backticks (command substitution)', () => {
    expect(() => validateArgs(['`whoami`'])).toThrow('shell metacharacters');
  });

  it('rejects args with $() (command substitution)', () => {
    expect(() => validateArgs(['$(id)'])).toThrow('shell metacharacters');
  });

  it('rejects args with ampersand (background execution)', () => {
    expect(() => validateArgs(['file.js&'])).toThrow('shell metacharacters');
  });

  it('rejects args with newlines (command injection)', () => {
    expect(() => validateArgs(['file.js\nrm -rf /'])).toThrow(
      'shell metacharacters',
    );
  });
});

// ── validateEnv ─────────────────────────────────────────────────────

describe('validateEnv', () => {
  it('returns undefined for undefined/null', () => {
    expect(validateEnv(undefined)).toBeUndefined();
    expect(validateEnv(null)).toBeUndefined();
  });

  it('accepts clean env vars', () => {
    expect(validateEnv({ API_KEY: 'abc123', NODE_ENV: 'production' })).toEqual({
      API_KEY: 'abc123',
      NODE_ENV: 'production',
    });
  });

  it('rejects non-object input', () => {
    expect(() => validateEnv('not-an-object')).toThrow('plain object');
    expect(() => validateEnv([1, 2])).toThrow('plain object');
  });

  it('rejects non-string values', () => {
    expect(() => validateEnv({ KEY: 123 })).toThrow('string value');
  });

  it('rejects env keys with shell metacharacters', () => {
    expect(() => validateEnv({ 'KEY;DROP': 'val' })).toThrow(
      'forbidden characters',
    );
  });

  it('rejects env values with control characters', () => {
    expect(() => validateEnv({ KEY: 'val\x00ue' })).toThrow(
      'control characters',
    );
    expect(() => validateEnv({ KEY: 'val\x07ue' })).toThrow(
      'control characters',
    );
  });

  it('allows env values with tabs (not a control char for our purposes)', () => {
    // Tab (\x09) is excluded from the control character range
    expect(validateEnv({ KEY: 'value\twith\ttabs' })).toEqual({
      KEY: 'value\twith\ttabs',
    });
  });
});

// ── McpPortalAdapter ────────────────────────────────────────────────

describe('McpPortalAdapter', () => {
  it('initializes with valid config', async () => {
    const adapter = new McpPortalAdapter([]);
    await adapter.initialize({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'ghp_abc123' },
    });
    const config = adapter.getMcpServerConfig();
    expect(config.command).toBe('npx');
    expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-github']);
    expect(config.env).toEqual({ GITHUB_TOKEN: 'ghp_abc123' });
  });

  it('rejects disallowed command', async () => {
    const adapter = new McpPortalAdapter([]);
    await expect(
      adapter.initialize({ command: 'bash', args: ['-c', 'echo pwned'] }),
    ).rejects.toThrow('not allowed');
  });

  it('rejects args with shell metacharacters', async () => {
    const adapter = new McpPortalAdapter([]);
    await expect(
      adapter.initialize({ command: 'node', args: ['server.js; rm -rf /'] }),
    ).rejects.toThrow('shell metacharacters');
  });

  it('rejects env values with control characters', async () => {
    const adapter = new McpPortalAdapter([]);
    await expect(
      adapter.initialize({
        command: 'node',
        args: ['server.js'],
        env: { EVIL: 'val\x00ue' },
      }),
    ).rejects.toThrow('control characters');
  });
});

// ── CliPortalAdapter ────────────────────────────────────────────────

describe('CliPortalAdapter', () => {
  it('initializes with valid command', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'python3' });
    expect(adapter.getCommand()).toBe('python3');
  });

  it('rejects disallowed command', async () => {
    const adapter = new CliPortalAdapter([]);
    await expect(
      adapter.initialize({ command: '/bin/sh' }),
    ).rejects.toThrow('not allowed');
  });
});

// ── PortalService.initializePortals ─────────────────────────────────

describe('PortalService.initializePortals', () => {
  const fakeHardwareService = {} as any;

  it('rejects portals with disallowed MCP commands', async () => {
    const service = new PortalService(fakeHardwareService);
    await expect(
      service.initializePortals([
        {
          id: 'evil',
          name: 'Evil',
          description: 'Malicious portal',
          mechanism: 'mcp',
          capabilities: [],
          interactions: [],
          mcpConfig: { command: 'bash', args: ['-c', 'echo pwned'] },
        },
      ]),
    ).rejects.toThrow('not allowed');
  });

  it('rejects portals with shell metacharacter args', async () => {
    const service = new PortalService(fakeHardwareService);
    await expect(
      service.initializePortals([
        {
          id: 'inject',
          name: 'Injector',
          description: 'Injection attempt',
          mechanism: 'mcp',
          capabilities: [],
          interactions: [],
          mcpConfig: { command: 'npx', args: ['server; rm -rf /'] },
        },
      ]),
    ).rejects.toThrow('shell metacharacters');
  });

  it('accepts portals with valid MCP config', async () => {
    const service = new PortalService(fakeHardwareService);
    await service.initializePortals([
      {
        id: 'github',
        name: 'GitHub',
        description: 'GitHub MCP',
        mechanism: 'mcp',
        capabilities: [],
        interactions: [],
        mcpConfig: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'ghp_abc123' },
        },
      },
    ]);
    const servers = service.getMcpServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].command).toBe('npx');
  });
});
