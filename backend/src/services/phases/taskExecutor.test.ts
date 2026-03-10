/** Unit tests for TaskExecutor.buildTestExpectations and test_expectations emission. */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

import { TaskExecutor } from './taskExecutor.js';
import type { TaskExecutorDeps, TaskExecutionOptions } from './taskExecutor.js';
import type { PhaseContext } from './types.js';
import type { Task, Agent, TaskStatus, AgentRole, AgentStatus } from '../../models/session.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TaskDAG } from '../../utils/dag.js';
import { PromptBuilder } from './promptBuilder.js';

function makeTask(id: string, name: string, agentName: string, deps: string[] = [], criteria: string[] = []): Task {
  return {
    id,
    name,
    description: `Do ${name}`,
    status: 'pending' as TaskStatus,
    agent_name: agentName,
    dependencies: deps,
    acceptance_criteria: criteria,
  };
}

function makeAgent(name: string, role: AgentRole = 'builder'): Agent {
  return { name, role, persona: 'helpful', status: 'idle' as AgentStatus };
}

describe('TaskExecutor.buildTestExpectations', () => {
  let executor: TaskExecutor;

  beforeEach(() => {
    const deps = {
      agentRunner: {} as any,
      git: null,
      teachingEngine: {} as any,
      tokenTracker: new TokenTracker(),
      context: new ContextManager(),
      promptBuilder: new PromptBuilder(),
      portalService: { getMcpServers: () => [] } as any,
    } satisfies TaskExecutorDeps;
    executor = new TaskExecutor(deps);
  });

  it('returns empty array when no acceptance_criteria', () => {
    const task = makeTask('t1', 'Setup', 'builder-1');
    const result = executor.buildTestExpectations(task);
    expect(result).toEqual([]);
  });

  it('converts acceptance criteria to test names', () => {
    const task = makeTask('t1', 'Build UI', 'builder-1', [], [
      'Button renders correctly',
      'Form submits data',
    ]);
    const result = executor.buildTestExpectations(task);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('test_button_renders_correctly');
    expect(result[0].description).toBe('Button renders correctly');
    expect(result[1].name).toBe('test_form_submits_data');
    expect(result[1].description).toBe('Form submits data');
  });

  it('strips special characters from test names', () => {
    const task = makeTask('t1', 'Test', 'tester-1', [], [
      'API responds with 200 (OK)',
    ]);
    const result = executor.buildTestExpectations(task);
    expect(result[0].name).toBe('test_api_responds_with_200_ok');
  });

  it('truncates long criterion names to 80 chars', () => {
    const longCriterion = 'a'.repeat(120);
    const task = makeTask('t1', 'Test', 'tester-1', [], [longCriterion]);
    const result = executor.buildTestExpectations(task);
    // "test_" prefix (5) + 80 chars = 85
    expect(result[0].name.length).toBeLessThanOrEqual(85);
  });
});

describe('TaskExecutor.executeTask emits test_expectations', () => {
  let executor: TaskExecutor;
  let events: Record<string, any>[];
  let nuggetDir: string;

  beforeEach(() => {
    nuggetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-exec-expectations-'));
    // Create required .elisa subdirectories
    fs.mkdirSync(path.join(nuggetDir, '.elisa', 'comms'), { recursive: true });
    fs.mkdirSync(path.join(nuggetDir, '.elisa', 'context'), { recursive: true });
    fs.mkdirSync(path.join(nuggetDir, '.elisa', 'status'), { recursive: true });
    events = [];
  });

  it('emits test_expectations event before agent execution', async () => {
    const tokenTracker = new TokenTracker();
    const deps: TaskExecutorDeps = {
      agentRunner: {
        execute: vi.fn().mockResolvedValue({
          success: true,
          summary: 'Done',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        }),
      } as any,
      git: null,
      teachingEngine: { getMoment: vi.fn().mockResolvedValue(null) } as any,
      tokenTracker,
      context: new ContextManager(),
      promptBuilder: {
        buildTaskPrompt: vi.fn().mockReturnValue({
          systemPrompt: 'system',
          userPrompt: 'user',
        }),
      } as any,
      portalService: { getMcpServers: () => [] } as any,
    };
    executor = new TaskExecutor(deps);

    const task = makeTask('t1', 'Build button', 'builder-1', [], [
      'Button is clickable',
      'Button shows label',
    ]);
    const agent = makeAgent('builder-1');
    const ctx: PhaseContext = {
      session: {
        id: 'sess-1',
        state: 'executing',
        spec: { nugget: { goal: 'test', type: 'software', description: 'test' } },
        tasks: [task],
        agents: [agent],
      } as any,
      send: vi.fn(async (evt: Record<string, any>) => { events.push(evt); }) as any,
      logger: null,
      nuggetDir,
      nuggetType: 'software',
      abortSignal: new AbortController().signal,
    };

    const dag = new TaskDAG();
    dag.addTask('t1', []);

    const options: TaskExecutionOptions = {
      taskMap: { t1: task },
      taskSummaries: {},
      tasks: [task],
      agents: [agent],
      nuggetDir,
      gitMutex: async (fn) => { await fn(); },
      questionResolvers: new Map(),
      gateResolver: { current: null },
      dag,
      completed: new Set(),
      commits: [],
    };

    await executor.executeTask(task, agent, ctx, options);

    // Find the test_expectations event
    const expectationsEvent = events.find(e => e.type === 'test_expectations');
    expect(expectationsEvent).toBeDefined();
    expect(expectationsEvent!.task_id).toBe('t1');
    expect(expectationsEvent!.tests).toHaveLength(2);
    expect(expectationsEvent!.tests[0].name).toBe('test_button_is_clickable');
    expect(expectationsEvent!.tests[1].name).toBe('test_button_shows_label');

    // Verify test_expectations was emitted before agent execution
    const expectationsIdx = events.findIndex(e => e.type === 'test_expectations');
    const agentOutputIdx = events.findIndex(e => e.type === 'task_completed' || e.type === 'agent_output');
    expect(expectationsIdx).toBeLessThan(agentOutputIdx);
  });
});
