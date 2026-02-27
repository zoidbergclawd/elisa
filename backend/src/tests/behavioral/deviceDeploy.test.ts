import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployPhase } from '../../services/phases/deployPhase.js';

function mockCtx(spec: Record<string, any> = {}) {
  return {
    session: { spec, state: 'running', workDir: '/tmp/work' },
    send: vi.fn(async () => {}),
    logger: null,
    nuggetDir: '/tmp/nugget',
    nuggetType: 'iot',
    abortSignal: new AbortController().signal,
  };
}

function mockRegistry(manifests: Record<string, any>) {
  return {
    getDevice: (id: string) => manifests[id],
    getAllDevices: () => Object.values(manifests),
    getFlashFiles: vi.fn(() => ({ lib: [], shared: [] })),
    getScaffoldDir: vi.fn(() => null),
    getAgentContext: vi.fn(() => ''),
  };
}

describe('DeployPhase device deployment', () => {
  it('shouldDeployDevices returns true when spec has devices', () => {
    const phase = new DeployPhase({} as any, {} as any, {} as any);
    const ctx = mockCtx({ devices: [{ pluginId: 'x', instanceId: 'b1', fields: {} }] });
    expect(phase.shouldDeployDevices(ctx as any)).toBe(true);
  });

  it('shouldDeployDevices returns false when spec has no devices', () => {
    const phase = new DeployPhase({} as any, {} as any, {} as any);
    const ctx = mockCtx({});
    expect(phase.shouldDeployDevices(ctx as any)).toBe(false);
  });

  it('shouldDeployDevices returns false for empty devices array', () => {
    const phase = new DeployPhase({} as any, {} as any, {} as any);
    const ctx = mockCtx({ devices: [] });
    expect(phase.shouldDeployDevices(ctx as any)).toBe(false);
  });
});
