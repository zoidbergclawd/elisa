/** Unit tests for DeviceFileValidator.
 *
 * Tests the extracted device file validation logic: missing file detection,
 * fixup agent invocation, prompt construction, success/failure handling.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

vi.mock('../../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}. Goal: {nugget_goal}. Type: {nugget_type}. Desc: {nugget_description}. Persona: {persona}. Paths: {allowed_paths}. Restricted: {restricted_paths}. Task: {task_id}. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Build the thing'),
}));

vi.mock('../../prompts/testerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a tester.',
  formatTaskPrompt: vi.fn().mockReturnValue('Test the thing'),
}));

vi.mock('../../prompts/reviewerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a reviewer.',
  formatTaskPrompt: vi.fn().mockReturnValue('Review the thing'),
}));

import { DeviceFileValidator } from '../../services/phases/deviceFileValidator.js';
import type { DeviceFileValidatorDeps } from '../../services/phases/deviceFileValidator.js';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-device-file-validator-'));
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'executing',
      spec: {
        nugget: { goal: 'test goal', type: 'software', description: 'test desc' },
        devices: [],
      },
      tasks: [],
      agents: [],
    } as unknown as BuildSession,
    send: (async (evt: Record<string, any>) => { events.push(evt); }) as any,
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeAgentRunner(overrides: Partial<{ execute: any }> = {}) {
  return {
    execute: overrides.execute ?? vi.fn().mockResolvedValue({
      success: true,
      summary: 'Fixed it',
      inputTokens: 50,
      outputTokens: 25,
      costUsd: 0.005,
    }),
  } as any;
}

function makeDeviceRegistry(overrides: Partial<{
  getDevice: any;
  getAgentContext: any;
}> = {}) {
  return {
    getDevice: overrides.getDevice ?? vi.fn().mockReturnValue(null),
    getAgentContext: overrides.getAgentContext ?? vi.fn().mockReturnValue(''),
    getAllDevices: vi.fn().mockReturnValue([]),
    getBlockDefinitions: vi.fn().mockReturnValue([]),
    getFlashFiles: vi.fn().mockReturnValue({ lib: [], shared: [] }),
  } as any;
}

function makeDeps(overrides: Partial<DeviceFileValidatorDeps> = {}): DeviceFileValidatorDeps {
  return {
    agentRunner: makeAgentRunner(),
    deviceRegistry: makeDeviceRegistry(),
    ...overrides,
  };
}

// -- Setup / Teardown --

beforeEach(() => {
  nuggetDir = makeTempDir();
  events = [];
});

afterEach(() => {
  fs.rmSync(nuggetDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// findMissingFiles
// ---------------------------------------------------------------------------

describe('DeviceFileValidator.findMissingFiles', () => {
  it('returns empty array when no devices in spec', () => {
    const deps = makeDeps();
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx();

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([]);
  });

  it('returns empty array when device manifest has no flash deploy', () => {
    const deps = makeDeps({
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'box-3',
          deploy: { method: 'cloud', cloud: {} },
        }),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'box-3' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([]);
  });

  it('returns empty array when all required files exist', () => {
    // Create the file that the manifest expects
    fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'print("hello")', 'utf-8');

    const deps = makeDeps({
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([]);
  });

  it('detects missing required files', () => {
    const deps = makeDeps({
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: {
            method: 'flash',
            flash: { files: ['main.py', 'config.py'], lib: [], shared_lib: [] },
          },
        }),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([
      { pluginId: 'esp32-led', file: 'main.py' },
      { pluginId: 'esp32-led', file: 'config.py' },
    ]);
  });

  it('detects missing files across multiple devices', () => {
    // Create one file but not the other
    fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'print("hello")', 'utf-8');

    const getDeviceMock = vi.fn().mockImplementation((id: string) => {
      if (id === 'device-a') {
        return {
          id: 'device-a',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        };
      }
      if (id === 'device-b') {
        return {
          id: 'device-b',
          deploy: { method: 'flash', flash: { files: ['sensor.py'], lib: [], shared_lib: [] } },
        };
      }
      return null;
    });

    const deps = makeDeps({
      deviceRegistry: makeDeviceRegistry({ getDevice: getDeviceMock }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'device-a' }, { pluginId: 'device-b' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([
      { pluginId: 'device-b', file: 'sensor.py' },
    ]);
  });

  it('skips unknown devices (getDevice returns undefined)', () => {
    const deps = makeDeps({
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue(undefined),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'unknown-device' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const missing = validator.findMissingFiles(ctx);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validate (full flow)
// ---------------------------------------------------------------------------

describe('DeviceFileValidator.validate', () => {
  it('does nothing when no devices are present', async () => {
    const agentRunner = makeAgentRunner();
    const deps = makeDeps({ agentRunner });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx();

    await validator.validate(ctx);

    expect(agentRunner.execute).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('does nothing when all files exist', async () => {
    fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'print("hi")', 'utf-8');

    const agentRunner = makeAgentRunner();
    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    expect(agentRunner.execute).not.toHaveBeenCalled();
  });

  it('runs fixup agent for missing files', async () => {
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockImplementation(async (params: any) => {
        // Simulate the fixup agent creating the file
        fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'print("fixed")', 'utf-8');
        return { success: true, summary: 'Created main.py', inputTokens: 50, outputTokens: 25, costUsd: 0.005 };
      }),
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
        getAgentContext: vi.fn().mockReturnValue('Generate `main.py` as the entry point'),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'LED blinker', type: 'hardware', description: 'Blinks an LED' },
          devices: [{ pluginId: 'esp32-led', fields: { led_pin: '2' } }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    // Fixup agent was called
    expect(agentRunner.execute).toHaveBeenCalledTimes(1);
    const callArgs = agentRunner.execute.mock.calls[0][0];
    expect(callArgs.taskId).toBe('fixup-esp32-led');
    expect(callArgs.prompt).toContain('main.py');
    expect(callArgs.prompt).toContain('Generate `main.py` as the entry point');
    expect(callArgs.prompt).toContain('led_pin: 2');
    expect(callArgs.systemPrompt).toContain('Fixup Agent');
    expect(callArgs.systemPrompt).toContain('LED blinker');
    expect(callArgs.maxTurns).toBe(10);

    // agent_output event was emitted for fixup start
    const agentOutputEvents = events.filter(e => e.type === 'agent_output');
    expect(agentOutputEvents.length).toBeGreaterThanOrEqual(1);
    expect(agentOutputEvents[0].task_id).toBe('fixup-esp32-led');
    expect(agentOutputEvents[0].content).toContain('main.py');

    // No error event since file was created
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents).toEqual([]);
  });

  it('emits error when fixup agent fails to create file', async () => {
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: 'Tried but failed',
        inputTokens: 50,
        outputTokens: 25,
        costUsd: 0.005,
      }),
      // Note: does NOT actually create the file
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
        getAgentContext: vi.fn().mockReturnValue(''),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    expect(agentRunner.execute).toHaveBeenCalledTimes(1);

    // Error event emitted because file still doesn't exist
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].message).toContain('Fixup agent failed to create main.py');
    expect(errorEvents[0].recoverable).toBe(true);
  });

  it('emits error when fixup agent throws', async () => {
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockRejectedValue(new Error('SDK connection failed')),
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
        getAgentContext: vi.fn().mockReturnValue(''),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    expect(agentRunner.execute).toHaveBeenCalledTimes(1);

    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].message).toContain('SDK connection failed');
    expect(errorEvents[0].recoverable).toBe(true);
  });

  it('runs fixup agents for multiple missing files', async () => {
    let callCount = 0;
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockImplementation(async (params: any) => {
        callCount++;
        // Simulate creating the file based on the prompt
        if (params.prompt.includes('main.py')) {
          fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'print("main")', 'utf-8');
        }
        if (params.prompt.includes('boot.py')) {
          fs.writeFileSync(path.join(nuggetDir, 'boot.py'), 'print("boot")', 'utf-8');
        }
        return { success: true, summary: 'Done', inputTokens: 50, outputTokens: 25, costUsd: 0.005 };
      }),
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: {
            method: 'flash',
            flash: { files: ['main.py', 'boot.py'], lib: [], shared_lib: [] },
          },
        }),
        getAgentContext: vi.fn().mockReturnValue(''),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    expect(agentRunner.execute).toHaveBeenCalledTimes(2);
    expect(events.filter(e => e.type === 'error')).toEqual([]);
  });

  it('passes abort signal to fixup agent', async () => {
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockImplementation(async (params: any) => {
        fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'ok', 'utf-8');
        return { success: true, summary: 'Done', inputTokens: 10, outputTokens: 5, costUsd: 0.001 };
      }),
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
        getAgentContext: vi.fn().mockReturnValue(''),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const abortController = new AbortController();
    const ctx = makeCtx({
      abortSignal: abortController.signal,
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    const callArgs = agentRunner.execute.mock.calls[0][0];
    expect(callArgs.abortSignal).toBe(abortController.signal);
  });

  it('sanitizes nugget goal/type/description in fixup system prompt', async () => {
    const agentRunner = makeAgentRunner({
      execute: vi.fn().mockImplementation(async () => {
        fs.writeFileSync(path.join(nuggetDir, 'main.py'), 'ok', 'utf-8');
        return { success: true, summary: 'Done', inputTokens: 10, outputTokens: 5, costUsd: 0.001 };
      }),
    });

    const deps = makeDeps({
      agentRunner,
      deviceRegistry: makeDeviceRegistry({
        getDevice: vi.fn().mockReturnValue({
          id: 'esp32-led',
          deploy: { method: 'flash', flash: { files: ['main.py'], lib: [], shared_lib: [] } },
        }),
        getAgentContext: vi.fn().mockReturnValue(''),
      }),
    });
    const validator = new DeviceFileValidator(deps);
    const ctx = makeCtx({
      session: {
        id: 'test',
        state: 'executing',
        spec: {
          nugget: {
            goal: '## Injected Header',
            type: '```code injection```',
            description: '<script>alert("xss")</script>',
          },
          devices: [{ pluginId: 'esp32-led' }],
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await validator.validate(ctx);

    const callArgs = agentRunner.execute.mock.calls[0][0];
    // sanitizePlaceholder strips ## headers, ``` code fences, and HTML tags
    expect(callArgs.systemPrompt).not.toContain('##');
    expect(callArgs.systemPrompt).not.toContain('```');
    expect(callArgs.systemPrompt).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// Integration: ExecutePhase wiring
// ---------------------------------------------------------------------------

describe('DeviceFileValidator integration with ExecutePhase', () => {
  it('ExecuteDeps accepts optional deviceFileValidator', async () => {
    // This test verifies the type-level integration by importing ExecuteDeps
    // and confirming the optional field is accepted
    const { ExecutePhase } = await import('../../services/phases/executePhase.js');
    const validator = new DeviceFileValidator(makeDeps());

    // Constructing ExecutePhase with a deviceFileValidator should not throw
    // (we just verify it accepts the property, not run the full pipeline)
    expect(() => {
      // @ts-expect-error -- partial deps for type check only
      new ExecutePhase({
        agentRunner: makeAgentRunner(),
        git: null,
        teachingEngine: {} as any,
        tokenTracker: { reserve: vi.fn(), releaseReservation: vi.fn() } as any,
        portalService: {} as any,
        context: {} as any,
        tasks: [],
        agents: [],
        taskMap: {},
        agentMap: {},
        dag: { getReady: vi.fn().mockReturnValue([]) } as any,
        questionResolvers: new Map(),
        gateResolver: { current: null },
        deviceFileValidator: validator,
      });
    }).not.toThrow();
  });
});
