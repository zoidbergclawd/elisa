/** Tests for DeployPhase web deployment: shouldDeployWeb(), deployWeb(), findFreePort(). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

// Mock child_process to prevent spawning real servers and opening browser tabs
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    execFile: vi.fn(),
    spawn: vi.fn(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.pid = 99999;
      proc.kill = vi.fn();
      // Simulate serve printing its listen URL on stderr (serve v14 uses stderr for info)
      setTimeout(() => {
        proc.stderr.emit('data', Buffer.from(' INFO  Accepting connections at http://localhost:4567\n'));
      }, 50);
      return proc;
    }),
  };
});

// Inline mock factories for services
function makeMockHardwareService() {
  return {
    compile: vi.fn().mockResolvedValue({ success: true, errors: [] }),
    flash: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    detectBoard: vi.fn().mockResolvedValue(null),
    startSerialMonitor: vi.fn().mockResolvedValue({ close: vi.fn() }),
  } as any;
}

function makeMockPortalService() {
  return {
    initializePortals: vi.fn().mockResolvedValue(undefined),
    hasSerialPortals: vi.fn().mockReturnValue(false),
    getCliPortals: vi.fn().mockReturnValue([]),
    getMcpServers: vi.fn().mockReturnValue([]),
    teardownAll: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeMockTeachingEngine() {
  return {
    getMoment: vi.fn().mockResolvedValue(null),
  } as any;
}

function makeCtx(overrides: Partial<BuildSession> = {}): { ctx: PhaseContext; events: any[] } {
  const events: any[] = [];
  const session: BuildSession = {
    id: 'test-session',
    state: 'executing',
    spec: overrides.spec ?? {},
    tasks: [],
    agents: [],
    ...overrides,
  } as BuildSession;
  const ctx: PhaseContext = {
    session,
    send: vi.fn(async (evt: any) => { events.push(evt); }),
    logger: null,
    nuggetDir: path.join(os.tmpdir(), `elisa-deploy-web-test-${Date.now()}`),
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
  };
  return { ctx, events };
}

// Import after helpers are defined (uses real fs for nuggetDir)
import { DeployPhase } from '../../services/phases/deployPhase.js';
import { findFreePort } from '../../utils/findFreePort.js';

describe('DeployPhase - shouldDeployWeb', () => {
  let phase: DeployPhase;

  beforeEach(() => {
    phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
  });

  it('returns true when target is "web"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'web' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });

  it('returns true when target is "both"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'both' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });

  it('returns true when target is "preview"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'preview' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });

  it('returns false when target is "esp32"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'esp32' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(false);
  });

  it('returns true when deployment is not specified (defaults to preview)', () => {
    const { ctx } = makeCtx({ spec: {} });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });
});

describe('DeployPhase - deployWeb', () => {
  let phase: DeployPhase;
  let tmpDir: string;

  beforeEach(() => {
    phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    tmpDir = path.join(os.tmpdir(), `elisa-deploy-web-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows: ignore EPERM
    }
  });

  it('sends deploy_started and deploy_complete events', async () => {
    const { ctx, events } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    const started = events.find(e => e.type === 'deploy_started');
    expect(started).toBeDefined();
    expect(started.target).toBe('web');

    const complete = events.find(e => e.type === 'deploy_complete');
    expect(complete).toBeDefined();
    expect(complete.target).toBe('web');
    expect(complete.url).toMatch(/^http:\/\/localhost:\d+$/);

    // URL should be returned
    expect(result.url).toMatch(/^http:\/\/localhost:\d+$/);

    // Clean up server process if it started
    if (result.process) result.process.kill();
  });

  it('sets session state to deploying', async () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);
    expect(ctx.session.state).toBe('deploying');

    if (result.process) result.process.kill();
  });

  it('sends deploy_progress events', async () => {
    const { ctx, events } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    const progressEvents = events.filter(e => e.type === 'deploy_progress');
    expect(progressEvents.length).toBeGreaterThanOrEqual(3); // preparing, finding port, starting server

    if (result.process) result.process.kill();
  });

  it('surfaces before_deploy rules as deploy_checklist', async () => {
    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'web' },
        rules: [
          { name: 'Check build', prompt: 'Ensure build passes', trigger: 'before_deploy' },
          { name: 'Always rule', prompt: 'Always do this', trigger: 'always' },
        ],
      },
    });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    const checklist = events.find(e => e.type === 'deploy_checklist');
    expect(checklist).toBeDefined();
    expect(checklist.rules).toHaveLength(1);
    expect(checklist.rules[0].name).toBe('Check build');

    if (result.process) result.process.kill();
  });

  it('spawns serve with cwd and -p flag, not positional dir arg (serve v14 compat)', async () => {
    const { spawn } = await import('node:child_process');
    // Clear mock calls from prior tests so we only see this test's spawn
    (spawn as any).mockClear();
    const { ctx } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;
    // Create index.html in src/ subdir so serveDir resolves to src/
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.html'), '<html></html>');

    const result = await phase.deployWeb(ctx);

    // Find the spawn call for 'npx serve'
    const calls = (spawn as any).mock.calls as any[][];
    const serveCall = calls.find(
      (c: any[]) => c[0] === 'npx' && c[1]?.includes('serve'),
    );
    expect(serveCall).toBeDefined();

    const [, args, opts] = serveCall!;
    // Must use -p flag for port, NOT -l with raw number
    expect(args).toContain('-p');
    expect(args).not.toContain('-l');
    // Must NOT pass directory as positional arg (broken in serve v14)
    expect(args).not.toContain(srcDir);
    expect(args).not.toContain(tmpDir);
    // Must use cwd to set serve directory
    expect(opts.cwd).toBe(srcDir);
    // Must not use removed --no-clipboard flag
    expect(args).not.toContain('--no-clipboard');

    if (result.process) result.process.kill();
  });

  it('uses URL from serve stdout instead of assumed port', async () => {
    const { ctx, events } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    // The mock emits "Accepting connections at http://localhost:4567"
    // Deploy should parse this and use port 4567, not the findFreePort result
    const complete = events.find(e => e.type === 'deploy_complete');
    expect(complete.url).toBe('http://localhost:4567');
    expect(result.url).toBe('http://localhost:4567');

    if (result.process) result.process.kill();
  });

  it('does not auto-open browser after starting server', async () => {
    const { execFile } = await import('node:child_process');
    const { ctx } = makeCtx({ spec: { deployment: { target: 'web' } } });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    expect(execFile).not.toHaveBeenCalled();

    if (result.process) result.process.kill();
  });

  it('does not send deploy_checklist when no before_deploy rules exist', async () => {
    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'web' },
        rules: [{ name: 'Always rule', prompt: 'Always', trigger: 'always' }],
      },
    });
    ctx.nuggetDir = tmpDir;

    const result = await phase.deployWeb(ctx);

    const checklist = events.find(e => e.type === 'deploy_checklist');
    expect(checklist).toBeUndefined();

    if (result.process) result.process.kill();
  });
});

describe('findFreePort', () => {
  it('finds a free port', async () => {
    const port = await findFreePort(3000);
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThan(65536);
  });
});
