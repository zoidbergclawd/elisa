/** Behavioral tests for agent-efficiency features (#100, #101, #102, #103, #105).
 *
 * These tests verify cross-cutting behaviors introduced by the agent-efficiency
 * changes: stale metadata cleanup on rebuild, structural digest injection,
 * turn-efficiency coaching in assembled prompts, adaptive retry with increasing
 * maxTurns, and behavioral_tests flowing from spec to tester prompt.
 *
 * Unlike the existing executePhase.behavior.test.ts (which mocks prompt modules),
 * these tests use the REAL prompt modules where prompt content matters.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --
// We mock agentRunner, git, teaching, portals but NOT the prompt modules —
// we need real prompts to verify content reaches the agent.

vi.mock('../../services/agentRunner.js', () => ({
  AgentRunner: vi.fn(),
  getClaudeCodePath: () => '/mock/cli.js',
}));

vi.mock('../../services/gitService.js', () => ({
  GitService: vi.fn(),
}));

vi.mock('../../services/teachingEngine.js', () => ({
  TeachingEngine: vi.fn(),
}));

vi.mock('../../services/portalService.js', () => ({
  PortalService: vi.fn(),
}));

import { ExecutePhase } from '../../services/phases/executePhase.js';
import type { ExecuteDeps } from '../../services/phases/executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { MAX_TURNS_DEFAULT, MAX_TURNS_RETRY_INCREMENT } from '../../utils/constants.js';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-efficiency-'));
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test goal', type: 'software', description: 'test desc' } },
      tasks: [],
      agents: [],
    } as unknown as BuildSession,
    send: async (evt: Record<string, any>) => { events.push(evt); },
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeTask(id: string, name: string, agentName: string, deps: string[] = []) {
  return {
    id,
    name,
    description: `Do ${name}`,
    status: 'pending',
    agent_name: agentName,
    dependencies: deps,
    acceptance_criteria: [`${name} done`],
  };
}

function makeAgent(name: string, role = 'builder') {
  return { name, role, persona: 'helpful', status: 'idle' };
}

function makeExecuteMock(summary = 'Task completed successfully with all requirements met and verified') {
  return vi.fn().mockResolvedValue({
    success: true,
    summary,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });
}

function makeDeps(
  executeMock: ReturnType<typeof vi.fn>,
  overrides: Partial<ExecuteDeps> = {},
): ExecuteDeps {
  const tasks = overrides.tasks ?? [];
  const agents = overrides.agents ?? [];
  const taskMap: Record<string, Record<string, any>> = {};
  for (const t of tasks) taskMap[t.id] = t;
  const agentMap: Record<string, Record<string, any>> = {};
  for (const a of agents) agentMap[a.name] = a;
  const dag = overrides.dag ?? new TaskDAG();
  if (!overrides.dag) {
    for (const t of tasks) dag.addTask(t.id, t.dependencies ?? []);
  }

  return {
    agentRunner: { execute: executeMock } as any,
    git: null,
    teachingEngine: { getMoment: vi.fn().mockResolvedValue(null) } as any,
    tokenTracker: overrides.tokenTracker ?? new TokenTracker(),
    portalService: { getMcpServers: vi.fn().mockReturnValue([]) } as any,
    context: new ContextManager(),
    tasks,
    agents,
    taskMap: overrides.taskMap ?? taskMap,
    agentMap: overrides.agentMap ?? agentMap,
    dag,
    questionResolvers: new Map(),
    gateResolver: { current: null },
    ...overrides,
  };
}

// -- Setup / Teardown --

beforeEach(() => {
  vi.clearAllMocks();
  nuggetDir = makeTempDir();
  events = [];
});

afterEach(() => {
  try {
    fs.rmSync(nuggetDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================
// #100: Stale metadata cleanup on rebuild
// ============================================================

describe('#100: stale metadata cleanup on rebuild', () => {
  it('second execution cleans stale comms/context/status from first run', async () => {
    const executeMock = makeExecuteMock();
    const task1 = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent1 = makeAgent('Builder Bot');
    const deps1 = makeDeps(executeMock, { tasks: [task1], agents: [agent1] });
    const ctx1 = makeCtx();

    // First execution — creates .elisa/ dirs and writes context files
    const phase1 = new ExecutePhase(deps1);
    await phase1.execute(ctx1);

    // Verify first run created expected files
    const commsDir = path.join(nuggetDir, '.elisa', 'comms');
    const contextDir = path.join(nuggetDir, '.elisa', 'context');
    expect(fs.existsSync(commsDir)).toBe(true);
    expect(fs.existsSync(contextDir)).toBe(true);

    // Plant a stale comms file (simulating leftover from a previous session)
    const staleFile = path.join(commsDir, 'task-old_summary.md');
    fs.writeFileSync(staleFile, 'stale summary from previous session');
    expect(fs.existsSync(staleFile)).toBe(true);

    // Also add a source file that should NOT be cleaned
    const srcFile = path.join(nuggetDir, 'src', 'app.js');
    fs.writeFileSync(srcFile, 'console.log("hello");');

    // Second execution (rebuild) — should clean stale metadata
    events = [];
    const task2 = makeTask('task-1', 'Rebuild UI', 'Builder Bot');
    const agent2 = makeAgent('Builder Bot');
    const deps2 = makeDeps(makeExecuteMock(), { tasks: [task2], agents: [agent2] });
    const ctx2 = makeCtx();
    const phase2 = new ExecutePhase(deps2);
    await phase2.execute(ctx2);

    // Stale comms file should be gone
    expect(fs.existsSync(staleFile)).toBe(false);

    // Source file should survive
    expect(fs.existsSync(srcFile)).toBe(true);

    // workspace_created event should fire on the second run
    const wsEvents = events.filter((e) => e.type === 'workspace_created');
    expect(wsEvents.length).toBe(1);
  });

  it('preserves .elisa/logs/ across rebuilds', async () => {
    // First run
    const task = makeTask('task-1', 'Build', 'Builder Bot');
    const deps = makeDeps(makeExecuteMock(), { tasks: [task], agents: [makeAgent('Builder Bot')] });
    const ctx = makeCtx();
    await new ExecutePhase(deps).execute(ctx);

    // Create a log file
    const logsDir = path.join(nuggetDir, '.elisa', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'session-1.log');
    fs.writeFileSync(logFile, 'log entry from first run');

    // Second run (rebuild)
    const task2 = makeTask('task-1', 'Rebuild', 'Builder Bot');
    const deps2 = makeDeps(makeExecuteMock(), { tasks: [task2], agents: [makeAgent('Builder Bot')] });
    await new ExecutePhase(deps2).execute(makeCtx());

    // Log file must still exist
    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.readFileSync(logFile, 'utf-8')).toBe('log entry from first run');
  });
});

// ============================================================
// #101: Structural digest injection into agent prompts
// ============================================================

describe('#101: structural digest injection', () => {
  it('agent prompt includes function signatures from workspace source files', async () => {
    // Create real source files in the workspace BEFORE execution
    const srcDir = path.join(nuggetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'game.js'),
      'function startGame() { return true; }\nfunction resetScore() { score = 0; }\n',
    );

    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Built game logic with start and reset functionality', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build game', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(capturedPrompts.length).toBe(1);
    const prompt = capturedPrompts[0];

    // Digest should contain function signatures extracted from the source file
    expect(prompt).toContain('Structural Digest');
    expect(prompt).toContain('startGame');
    expect(prompt).toContain('resetScore');
  });

  it('digest is absent when workspace has no source files', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Created initial project structure from scratch', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [makeAgent('Builder Bot')] });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    expect(capturedPrompts.length).toBe(1);
    expect(capturedPrompts[0]).not.toContain('Structural Digest');
  });

  it('digest appears after file manifest in the prompt', async () => {
    // Create a source file so both manifest and digest are present
    const srcDir = path.join(nuggetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.js'), 'export function main() {}');

    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Implemented main entry point with exports', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build', 'Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [makeAgent('Builder Bot')] });
    await new ExecutePhase(deps).execute(makeCtx());

    const prompt = capturedPrompts[0];
    const manifestIdx = prompt.indexOf('FILES ALREADY IN WORKSPACE');
    const digestIdx = prompt.indexOf('Structural Digest');
    expect(manifestIdx).toBeGreaterThanOrEqual(0);
    expect(digestIdx).toBeGreaterThan(manifestIdx);
  });
});

// ============================================================
// #102: Turn-efficiency coaching in assembled prompts
// ============================================================

describe('#102: turn-efficiency coaching in assembled prompts', () => {
  it('builder agent system prompt contains Turn Efficiency section', async () => {
    const capturedSystemPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedSystemPrompts.push(opts.systemPrompt);
      return { success: true, summary: 'Completed full implementation with proper structure', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot', 'builder');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    expect(capturedSystemPrompts.length).toBe(1);
    const sysPrompt = capturedSystemPrompts[0];
    expect(sysPrompt).toContain('Turn Efficiency');
    expect(sysPrompt).toContain('limited turn budget');
    expect(sysPrompt).toContain('file manifest and structural digest');
  });

  it('tester agent system prompt contains Turn Efficiency with testing-specific guidance', async () => {
    const capturedSystemPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedSystemPrompts.push(opts.systemPrompt);
      return { success: true, summary: 'All tests pass with full coverage of acceptance criteria', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Test UI', 'Test Bot');
    const agent = makeAgent('Test Bot', 'tester');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    expect(capturedSystemPrompts.length).toBe(1);
    const sysPrompt = capturedSystemPrompts[0];
    expect(sysPrompt).toContain('Turn Efficiency');
    expect(sysPrompt).toContain('Prioritize testing over exploration');
    expect(sysPrompt).toContain('Begin writing tests within your first');
  });

  it('reviewer agent system prompt contains Turn Efficiency with review-specific guidance', async () => {
    const capturedSystemPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedSystemPrompts.push(opts.systemPrompt);
      return { success: true, summary: 'Code review complete: APPROVED with no blocking issues', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Review code', 'Review Bot');
    const agent = makeAgent('Review Bot', 'reviewer');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    expect(capturedSystemPrompts.length).toBe(1);
    const sysPrompt = capturedSystemPrompts[0];
    expect(sysPrompt).toContain('Turn Efficiency');
    expect(sysPrompt).toContain('Prioritize review over exploration');
    expect(sysPrompt).toContain('Begin reviewing code within your first');
  });

  it('Thinking Steps reference manifest and digest in all agent roles', async () => {
    const capturedSystemPrompts: Record<string, string> = {};
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedSystemPrompts[opts.taskId] = opts.systemPrompt;
      return { success: true, summary: 'Completed task with thorough work and verification', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const tasks = [
      makeTask('task-1', 'Build', 'Builder Bot'),
      makeTask('task-2', 'Test', 'Test Bot', ['task-1']),
      makeTask('task-3', 'Review', 'Review Bot', ['task-2']),
    ];
    const agents = [
      makeAgent('Builder Bot', 'builder'),
      makeAgent('Test Bot', 'tester'),
      makeAgent('Review Bot', 'reviewer'),
    ];
    const deps = makeDeps(executeMock, { tasks, agents });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    // All 3 agents should have received prompts referencing manifest/digest
    for (const taskId of ['task-1', 'task-2', 'task-3']) {
      const sysPrompt = capturedSystemPrompts[taskId];
      expect(sysPrompt, `${taskId} should have Thinking Steps`).toContain('Thinking Steps');
      expect(sysPrompt, `${taskId} should reference digest`).toContain('file manifest and structural digest');
    }
  });
});

// ============================================================
// #103: Adaptive retry with increasing maxTurns and failure context
// ============================================================

describe('#103: adaptive retry with increasing maxTurns and failure context', () => {
  it('retry attempts receive increasing maxTurns: 25 → 35 → 45', async () => {
    const capturedMaxTurns: number[] = [];

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedMaxTurns.push(opts.maxTurns);
      // Fail on first two, succeed on third
      if (capturedMaxTurns.length <= 2) {
        return { success: false, summary: 'Failed: compilation error in the main module', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return { success: true, summary: 'Succeeded after fixing compilation errors on third attempt', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const phase = new ExecutePhase(deps);
    await phase.execute(makeCtx());

    expect(capturedMaxTurns).toEqual([
      MAX_TURNS_DEFAULT,                                    // attempt 0: 25
      MAX_TURNS_DEFAULT + MAX_TURNS_RETRY_INCREMENT,        // attempt 1: 35
      MAX_TURNS_DEFAULT + 2 * MAX_TURNS_RETRY_INCREMENT,   // attempt 2: 45
    ]);
  });

  it('retry prompts are prepended with failure context header', async () => {
    const capturedPrompts: string[] = [];

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      if (capturedPrompts.length === 1) {
        return { success: false, summary: 'Failed on first attempt due to missing dependency', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return { success: true, summary: 'Resolved missing dependency and completed successfully', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [makeAgent('Builder Bot')] });
    await new ExecutePhase(deps).execute(makeCtx());

    // First attempt: no retry header
    expect(capturedPrompts[0]).not.toContain('## Retry Attempt');

    // Second attempt: has retry context
    expect(capturedPrompts[1]).toContain('## Retry Attempt 1');
    expect(capturedPrompts[1]).toContain('previous attempt');
    expect(capturedPrompts[1]).toContain('Skip orientation');
    expect(capturedPrompts[1]).toContain('Go straight to implementation');
  });

  it('first attempt prompt does NOT contain retry context', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Completed on first try with all criteria satisfied', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build', 'Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [makeAgent('Builder Bot')] });
    await new ExecutePhase(deps).execute(makeCtx());

    expect(capturedPrompts.length).toBe(1);
    expect(capturedPrompts[0]).not.toContain('Retry Attempt');
    expect(capturedPrompts[0]).not.toContain('previous attempt');
  });

  it('exhausting all retries fires human_gate with correct retry_count', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Persistent compilation failure that could not be resolved automatically',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [makeAgent('Builder Bot')] });
    const phase = new ExecutePhase(deps);
    const runPromise = phase.execute(makeCtx());

    // Wait for human_gate to fire after all retries exhaust
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'human_gate')).toBe(true); },
      { timeout: 5000 },
    );

    // Resolve gate
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    // Agent was called 3 times (1 initial + 2 retries)
    expect(executeMock).toHaveBeenCalledTimes(3);

    // task_failed shows retry_count = 3
    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].retry_count).toBe(3);
  });
});

// ============================================================
// #105: Behavioral tests flow from spec to tester prompt
// ============================================================

describe('#105: behavioral_tests flow from spec to tester prompt', () => {
  it('tester agent prompt includes behavioral tests from spec.workflow', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'All behavioral tests verified and passing correctly', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Test game', 'Test Bot');
    const agent = makeAgent('Test Bot', 'tester');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });

    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'A platformer game', type: 'software', description: 'A fun game' },
          workflow: {
            behavioral_tests: [
              { when: 'the player presses jump', then: 'the character jumps' },
              { when: 'the player falls off the edge', then: 'the game shows game over' },
            ],
          },
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    const phase = new ExecutePhase(deps);
    await phase.execute(ctx);

    expect(capturedPrompts.length).toBe(1);
    const prompt = capturedPrompts[0];

    // Tester prompt should include behavioral tests section
    expect(prompt).toContain('Behavioral Tests to Verify');
    expect(prompt).toContain('When the player presses jump, then the character jumps');
    expect(prompt).toContain('When the player falls off the edge, then the game shows game over');
  });

  it('builder agent prompt does NOT include behavioral tests', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Built game with jump and edge detection mechanics', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Build game', 'Builder Bot');
    const agent = makeAgent('Builder Bot', 'builder');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });

    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'A game', type: 'software', description: 'A game' },
          workflow: {
            behavioral_tests: [
              { when: 'click play', then: 'game starts' },
            ],
          },
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await new ExecutePhase(deps).execute(ctx);

    // Builder doesn't have behavioral tests in its formatTaskPrompt
    expect(capturedPrompts[0]).not.toContain('Behavioral Tests to Verify');
  });

  it('tester prompt omits behavioral tests when spec has none', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Tests written and passing for all acceptance criteria', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Test app', 'Test Bot');
    const agent = makeAgent('Test Bot', 'tester');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    await new ExecutePhase(deps).execute(makeCtx());

    expect(capturedPrompts[0]).not.toContain('Behavioral Tests to Verify');
  });

  it('behavioral tests and structural digest both appear in tester prompt', async () => {
    // Create source files for digest
    const srcDir = path.join(nuggetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'game.js'), 'function startGame() { return true; }');

    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return { success: true, summary: 'Verified game start function with behavioral tests', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const task = makeTask('task-1', 'Test game', 'Test Bot');
    const agent = makeAgent('Test Bot', 'tester');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });

    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'A game', type: 'software', description: 'A game' },
          workflow: {
            behavioral_tests: [
              { when: 'user clicks play', then: 'game starts' },
            ],
          },
        },
        tasks: [],
        agents: [],
      } as unknown as BuildSession,
    });

    await new ExecutePhase(deps).execute(ctx);

    const prompt = capturedPrompts[0];
    // Both features should coexist in the same prompt
    expect(prompt).toContain('Behavioral Tests to Verify');
    expect(prompt).toContain('Structural Digest');
    expect(prompt).toContain('startGame');
  });
});
