/** Tests for CliPortalAdapter.execute() and PortalService.getCliPortals(). */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track mock calls and configure results
let mockExecFileCalls: any[][] = [];
let execFileResult: { err: any; stdout: string; stderr: string } = {
  err: null,
  stdout: '',
  stderr: '',
};

vi.mock('node:child_process', async () => {
  const { promisify: realPromisify } = await import('node:util');

  function mockExecFile(...args: any[]) {
    mockExecFileCalls.push(args);
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      cb(execFileResult.err, execFileResult.stdout, execFileResult.stderr);
    }
  }

  // promisify(execFile) uses the [util.promisify.custom] symbol
  (mockExecFile as any)[realPromisify.custom] = (...args: any[]) => {
    mockExecFileCalls.push(args);
    if (execFileResult.err) {
      const err = execFileResult.err;
      err.stdout = err.stdout ?? execFileResult.stdout;
      err.stderr = err.stderr ?? execFileResult.stderr;
      return Promise.reject(err);
    }
    return Promise.resolve({
      stdout: execFileResult.stdout,
      stderr: execFileResult.stderr,
    });
  };

  return { execFile: mockExecFile };
});

// Import after mock registration
const { CliPortalAdapter, PortalService } = await import('./portalService.js');

describe('CliPortalAdapter', () => {
  beforeEach(() => {
    mockExecFileCalls = [];
    execFileResult = { err: null, stdout: '', stderr: '' };
  });

  it('returns failure when no command is configured', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({});

    const result = await adapter.execute('/tmp/test');
    expect(result.success).toBe(false);
    expect(result.stderr).toBe('No command configured');
    expect(mockExecFileCalls).toHaveLength(0);
  });

  it('executes command and returns stdout/stderr on success', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'echo', args: ['hello'] });

    execFileResult = { err: null, stdout: 'hello\n', stderr: '' };

    const result = await adapter.execute('/tmp/test');
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('');
    expect(mockExecFileCalls).toHaveLength(1);
    expect(mockExecFileCalls[0][0]).toBe('echo');
    expect(mockExecFileCalls[0][1]).toEqual(['hello']);
  });

  it('returns failure when command throws', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'badcmd' });

    const err = new Error('ENOENT') as any;
    err.stdout = '';
    err.stderr = 'not found';
    execFileResult = { err, stdout: '', stderr: 'not found' };

    const result = await adapter.execute('/tmp/test');
    expect(result.success).toBe(false);
    expect(result.stderr).toBe('not found');
  });

  it('passes cwd and timeout to execFile', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'ls' });

    execFileResult = { err: null, stdout: '', stderr: '' };

    await adapter.execute('/my/dir', 5000);
    expect(mockExecFileCalls).toHaveLength(1);
    const opts = mockExecFileCalls[0][2];
    expect(opts.cwd).toBe('/my/dir');
    expect(opts.timeout).toBe(5000);
  });

  it('merges env when provided', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({
      command: 'node',
      env: { MY_VAR: 'hello' },
    });

    execFileResult = { err: null, stdout: '', stderr: '' };

    await adapter.execute('/tmp/test');
    const opts = mockExecFileCalls[0][2];
    expect(opts.env).toBeDefined();
    expect(opts.env.MY_VAR).toBe('hello');
  });

  it('does not set env when none provided', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'ls' });

    execFileResult = { err: null, stdout: '', stderr: '' };

    await adapter.execute('/tmp/test');
    const opts = mockExecFileCalls[0][2];
    expect(opts.env).toBeUndefined();
  });

  it('stores and returns args via getArgs()', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'git', args: ['status', '--short'] });

    expect(adapter.getArgs()).toEqual(['status', '--short']);
  });

  it('defaults args to empty array', async () => {
    const adapter = new CliPortalAdapter([]);
    await adapter.initialize({ command: 'ls' });

    expect(adapter.getArgs()).toEqual([]);
  });
});

describe('PortalService.getCliPortals', () => {
  it('returns only CLI portals', async () => {
    const mockHw = {} as any;
    const service = new PortalService(mockHw);

    await service.initializePortals([
      {
        id: 'cli-1',
        name: 'My CLI Tool',
        description: 'test',
        mechanism: 'cli',
        capabilities: [],
        interactions: [],
        cliConfig: { command: 'mytool' },
      },
      {
        id: 'mcp-1',
        name: 'MCP Server',
        description: 'test',
        mechanism: 'mcp',
        capabilities: [],
        interactions: [],
        mcpConfig: { command: 'mcp-server' },
      },
    ]);

    const cliPortals = service.getCliPortals();
    expect(cliPortals).toHaveLength(1);
    expect(cliPortals[0].name).toBe('My CLI Tool');
    expect(cliPortals[0].adapter.getCommand()).toBe('mytool');
  });

  it('returns empty array when no CLI portals exist', async () => {
    const mockHw = {} as any;
    const service = new PortalService(mockHw);

    await service.initializePortals([]);

    expect(service.getCliPortals()).toEqual([]);
  });
});
