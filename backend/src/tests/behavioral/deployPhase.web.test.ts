/** Tests for DeployPhase web deployment: shouldDeployWeb(), deployWeb(), findFreePort(). */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

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

  it('returns false when target is "preview"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'preview' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(false);
  });

  it('returns false when target is "esp32"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'esp32' } } });
    expect(phase.shouldDeployWeb(ctx)).toBe(false);
  });

  it('returns false when deployment is not specified (defaults to preview)', () => {
    const { ctx } = makeCtx({ spec: {} });
    expect(phase.shouldDeployWeb(ctx)).toBe(false);
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

describe('DeployPhase.findFreePort', () => {
  it('finds a free port', async () => {
    // Access findFreePort via the class (it's private static, so we use bracket notation)
    const port = await (DeployPhase as any).findFreePort(3000);
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThan(65536);
  });
});
