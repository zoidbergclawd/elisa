/** Tests for setupWorkspace() stale metadata cleanup (#100). */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

vi.mock('../../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}.',
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

import { ExecutePhase } from './executePhase.js';
import type { ExecuteDeps } from './executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import type { PhaseContext } from './types.js';
import type { Task, Agent } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-setup-ws-'));
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test goal', type: 'software', description: 'test desc' } },
      tasks: [],
      agents: [],
    } as any,
    send: async (evt: Record<string, any>) => { events.push(evt); },
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeTask(id: string, name: string, agentName: string, deps: string[] = []): Task {
  return {
    id, name,
    description: `Do ${name}`,
    status: 'pending',
    agent_name: agentName,
    dependencies: deps,
    acceptance_criteria: [`${name} done`],
  };
}

function makeAgent(name: string, role = 'builder'): Agent {
  return { name, role: role as Agent['role'], persona: 'helpful', status: 'idle' };
}

function makeDeps(
  executeMock: ReturnType<typeof vi.fn>,
  overrides: Partial<ExecuteDeps> = {},
): ExecuteDeps {
  const tasks = overrides.tasks ?? [];
  const agents = overrides.agents ?? [];
  const taskMap: Record<string, Task> = {};
  for (const t of tasks) taskMap[t.id] = t;
  const agentMap: Record<string, Agent> = {};
  for (const a of agents) agentMap[a.name] = a;
  const dag = overrides.dag ?? new TaskDAG();
  if (!overrides.dag) {
    for (const t of tasks) dag.addTask(t.id, t.dependencies ?? []);
  }

  return {
    agentRunner: { execute: executeMock } as any,
    git: overrides.git ?? null,
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
// Stale metadata cleanup (#100)
// ============================================================

describe('setupWorkspace stale metadata cleanup (#100)', () => {
  it('removes stale comms/context/status files on rebuild', async () => {
    // Pre-create stale metadata dirs with files
    const elisaDir = path.join(nuggetDir, '.elisa');
    const commsDir = path.join(elisaDir, 'comms');
    const contextDir = path.join(elisaDir, 'context');
    const statusDir = path.join(elisaDir, 'status');

    fs.mkdirSync(commsDir, { recursive: true });
    fs.mkdirSync(contextDir, { recursive: true });
    fs.mkdirSync(statusDir, { recursive: true });

    fs.writeFileSync(path.join(commsDir, 'task-old_summary.md'), 'stale comms');
    fs.writeFileSync(path.join(contextDir, 'nugget_context.md'), 'stale context');
    fs.writeFileSync(path.join(statusDir, 'current_state.json'), '{"stale": true}');

    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Task completed successfully with all requirements met and verified',
      inputTokens: 100, outputTokens: 50, costUsd: 0.01,
    });
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Stale comms file from a previous task should be gone
    expect(fs.existsSync(path.join(commsDir, 'task-old_summary.md'))).toBe(false);

    // context and status are rewritten by the current task, so check the
    // stale content was replaced with fresh content (not 'stale context')
    const contextContent = fs.readFileSync(path.join(contextDir, 'nugget_context.md'), 'utf-8');
    expect(contextContent).not.toBe('stale context');
    const stateContent = fs.readFileSync(path.join(statusDir, 'current_state.json'), 'utf-8');
    expect(stateContent).not.toBe('{"stale": true}');

    // Dirs should exist (recreated by mkdirSync loop)
    expect(fs.existsSync(commsDir)).toBe(true);
    expect(fs.existsSync(contextDir)).toBe(true);
    expect(fs.existsSync(statusDir)).toBe(true);
  });

  it('preserves .elisa/logs/ directory', async () => {
    // Pre-create logs dir with a log file
    const logsDir = path.join(nuggetDir, '.elisa', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'session.log'), 'previous session log');

    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Task completed successfully with all requirements met and verified',
      inputTokens: 100, outputTokens: 50, costUsd: 0.01,
    });
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Logs should be preserved
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.readFileSync(path.join(logsDir, 'session.log'), 'utf-8')).toBe('previous session log');
  });

  it('preserves source files in src/ and tests/', async () => {
    // Pre-create source files
    const srcDir = path.join(nuggetDir, 'src');
    const testsDir = path.join(nuggetDir, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'main.js'), 'console.log("hello")');
    fs.writeFileSync(path.join(testsDir, 'main.test.js'), 'test("works", () => {})');

    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Task completed successfully with all requirements met and verified',
      inputTokens: 100, outputTokens: 50, costUsd: 0.01,
    });
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Source files should be preserved
    expect(fs.readFileSync(path.join(srcDir, 'main.js'), 'utf-8')).toBe('console.log("hello")');
    expect(fs.readFileSync(path.join(testsDir, 'main.test.js'), 'utf-8')).toBe('test("works", () => {})');
  });

  it('works on fresh workspace (no-op — dirs do not exist yet)', async () => {
    // nuggetDir is fresh (no .elisa/ dirs exist yet)
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Task completed successfully with all requirements met and verified',
      inputTokens: 100, outputTokens: 50, costUsd: 0.01,
    });
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    // Should not throw
    await phase.execute(ctx);

    // Dirs should be created fresh
    expect(fs.existsSync(path.join(nuggetDir, '.elisa', 'comms'))).toBe(true);
    expect(fs.existsSync(path.join(nuggetDir, '.elisa', 'context'))).toBe(true);
    expect(fs.existsSync(path.join(nuggetDir, '.elisa', 'status'))).toBe(true);
  });
});
