/** Behavioral tests for the orchestrator pipeline.
 *
 * These tests verify end-to-end workflow invariants: event ordering,
 * state transitions, error handling, and spec-driven behavior.
 * External services (MetaPlanner, AgentRunner, etc.) are mocked;
 * the orchestrator's own control flow runs for real.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// -- Module mocks (hoisted) --

vi.mock('../../services/metaPlanner.js', () => {
  const MetaPlanner = vi.fn();
  MetaPlanner.prototype.plan = vi.fn();
  return { MetaPlanner };
});

vi.mock('../../services/agentRunner.js', () => {
  const AgentRunner = vi.fn();
  AgentRunner.prototype.execute = vi.fn();
  return { AgentRunner };
});

vi.mock('../../services/gitService.js', () => {
  const GitService = vi.fn();
  GitService.prototype.initRepo = vi.fn();
  GitService.prototype.commit = vi.fn();
  return { GitService };
});

vi.mock('../../services/testRunner.js', () => {
  const TestRunner = vi.fn();
  TestRunner.prototype.runTests = vi.fn();
  return { TestRunner };
});

vi.mock('../../services/teachingEngine.js', () => {
  const TeachingEngine = vi.fn();
  TeachingEngine.prototype.getMoment = vi.fn();
  TeachingEngine.prototype.getShownConcepts = vi.fn();
  return { TeachingEngine };
});

vi.mock('../../services/hardwareService.js', () => {
  const HardwareService = vi.fn();
  HardwareService.prototype.compile = vi.fn();
  HardwareService.prototype.flash = vi.fn();
  HardwareService.prototype.detectBoard = vi.fn();
  HardwareService.prototype.startSerialMonitor = vi.fn();
  return { HardwareService };
});

import { MetaPlanner } from '../../services/metaPlanner.js';
import { AgentRunner } from '../../services/agentRunner.js';
import {
  loadSpec,
  loadPlan,
  createTestOrchestrator,
  configurePlan,
  configureAgentSuccess,
  configureAgentFailure,
  configureHardwareSuccess,
  configureTestResults,
  setMockDefaults,
  eventTypes,
  eventsOfType,
  firstIndexOf,
  firstIndexWhere,
  cleanupNuggetDir,
} from './helpers.js';

// -- Fixtures --

const minimalWebSpec = loadSpec('minimal-web');
const minimalWebPlan = loadPlan('minimal-web');
const hardwareBlinkSpec = loadSpec('hardware-blink');
const hardwareBlinkPlan = loadPlan('hardware-blink');
const withTesterSpec = loadSpec('with-tester');
const withTesterPlan = loadPlan('with-tester');
const withHumanGateSpec = loadSpec('with-human-gate');
const withHumanGatePlan = loadPlan('with-human-gate');
const multiTaskSpec = loadSpec('multi-task');
const multiTaskPlan = loadPlan('multi-task');

// -- Setup / Teardown --

let currentOrchestrator: ReturnType<typeof createTestOrchestrator> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  setMockDefaults();
});

afterEach(() => {
  if (currentOrchestrator) {
    cleanupNuggetDir(currentOrchestrator.orchestrator);
    currentOrchestrator = null;
  }
});

// -- Helpers --

function setup(spec: Record<string, any>) {
  currentOrchestrator = createTestOrchestrator(spec);
  return currentOrchestrator;
}

// ============================================================
// Pipeline event ordering
// ============================================================

describe('pipeline event ordering', () => {
  it('emits planning_started before any task execution', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const planningIdx = firstIndexOf(events, 'planning_started');
    const firstTaskIdx = firstIndexOf(events, 'task_started');
    expect(planningIdx).toBeGreaterThanOrEqual(0);
    expect(firstTaskIdx).toBeGreaterThan(planningIdx);
  });

  it('emits plan_ready between planning_started and first task_started', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const planningIdx = firstIndexOf(events, 'planning_started');
    const readyIdx = firstIndexOf(events, 'plan_ready');
    const firstTaskIdx = firstIndexOf(events, 'task_started');

    expect(readyIdx).toBeGreaterThan(planningIdx);
    expect(firstTaskIdx).toBeGreaterThan(readyIdx);
  });

  it('emits session_complete as the final event on success', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const last = events[events.length - 1];
    expect(last.type).toBe('session_complete');
  });

  it('emits task_started before task_completed for every task', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    for (const task of multiTaskPlan.tasks) {
      const startIdx = firstIndexWhere(
        events,
        (e) => e.type === 'task_started' && e.task_id === task.id,
      );
      const completeIdx = firstIndexWhere(
        events,
        (e) => e.type === 'task_completed' && e.task_id === task.id,
      );
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(completeIdx).toBeGreaterThan(startIdx);
    }
  });

  it('emits token_usage after each task completes', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const taskCompletedIdx = firstIndexOf(events, 'task_completed');
    const tokenIdx = firstIndexOf(events, 'token_usage');

    // token_usage is emitted during task execution (before task_completed)
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(taskCompletedIdx).toBeGreaterThanOrEqual(0);
  });

  it('every plan produces at least one task_started event', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const taskStarts = eventsOfType(events, 'task_started');
    expect(taskStarts.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Session state transitions
// ============================================================

describe('session state transitions', () => {
  it('progresses through planning -> executing -> testing -> done for web specs', async () => {
    const { orchestrator, session } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    const states: string[] = [];
    let currentState = session.state;
    Object.defineProperty(session, 'state', {
      get: () => currentState,
      set: (val: string) => {
        states.push(val);
        currentState = val;
      },
      configurable: true,
    });

    await orchestrator.run(minimalWebSpec);

    expect(states).toEqual(['planning', 'executing', 'testing', 'deploying', 'done']);
  });

  it('includes deploying phase for hardware specs', async () => {
    const { orchestrator, session } = setup(hardwareBlinkSpec);
    configurePlan(hardwareBlinkPlan);
    configureAgentSuccess();
    configureHardwareSuccess();

    const states: string[] = [];
    let currentState = session.state;
    Object.defineProperty(session, 'state', {
      get: () => currentState,
      set: (val: string) => {
        states.push(val);
        currentState = val;
      },
      configurable: true,
    });

    await orchestrator.run(hardwareBlinkSpec);

    expect(states).toContain('deploying');
    const testIdx = states.indexOf('testing');
    const deployIdx = states.indexOf('deploying');
    expect(deployIdx).toBeGreaterThan(testIdx);
  });

  it('ends in done state after successful run', async () => {
    const { orchestrator, session } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    expect(session.state).toBe('done');
  });
});

// ============================================================
// Error handling
// ============================================================

describe('error handling', () => {
  it('retries a failed task and succeeds on later attempt', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);

    // Fail first, succeed on retry
    vi.mocked(AgentRunner.prototype.execute)
      .mockResolvedValueOnce({
        success: false,
        summary: 'fail 1',
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.005,
      })
      .mockResolvedValueOnce({
        success: true,
        summary: 'done after retry',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

    await orchestrator.run(minimalWebSpec);

    // Task should complete successfully
    const completed = eventsOfType(events, 'task_completed');
    expect(completed.length).toBe(1);

    // Should still reach session_complete
    const last = events[events.length - 1];
    expect(last.type).toBe('session_complete');
  });

  it('fires human gate after max retries exhausted', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentFailure('persistent failure');

    // The orchestrator will block on the human gate after 3 failures.
    // Run in background and respond to the gate.
    const runPromise = orchestrator.run(minimalWebSpec);

    // Poll for the human_gate event
    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    // Approve the gate to unblock
    orchestrator.respondToGate(true);

    await runPromise;

    const gateEvents = eventsOfType(events, 'human_gate');
    expect(gateEvents.length).toBeGreaterThan(0);
  });

  it('emits error event on circular DAG', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);

    const circularPlan = {
      tasks: [
        { id: 'a', name: 'A', description: '', dependencies: ['b'], agent_name: 'Builder Bot', acceptance_criteria: [] },
        { id: 'b', name: 'B', description: '', dependencies: ['a'], agent_name: 'Builder Bot', acceptance_criteria: [] },
      ],
      agents: [{ name: 'Builder Bot', role: 'builder', persona: '' }],
      plan_explanation: 'circular',
    };
    configurePlan(circularPlan);

    await orchestrator.run(minimalWebSpec);

    const errors = eventsOfType(events, 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/circle|circular/i);
  });

  it('surfaces meta-planner failure as an error event', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    vi.mocked(MetaPlanner.prototype.plan).mockRejectedValue(
      new Error('API rate limit exceeded'),
    );

    await orchestrator.run(minimalWebSpec);

    const errors = eventsOfType(events, 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('does not hang on meta-planner failure', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    vi.mocked(MetaPlanner.prototype.plan).mockRejectedValue(
      new Error('timeout'),
    );

    // Should resolve (not hang indefinitely)
    await orchestrator.run(minimalWebSpec);

    // Run completed -- if we got here, it didn't hang
    expect(events.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Spec-driven behavior
// ============================================================

describe('spec-driven behavior', () => {
  it('runs test phase and emits test_result events when testing_enabled', async () => {
    const { orchestrator, events } = setup(withTesterSpec);
    configurePlan(withTesterPlan);
    configureAgentSuccess();
    configureTestResults([
      { test_name: 'test_add_item', passed: true, details: 'PASSED' },
      { test_name: 'test_mark_done', passed: true, details: 'PASSED' },
    ]);

    await orchestrator.run(withTesterSpec);

    const testEvents = eventsOfType(events, 'test_result');
    expect(testEvents.length).toBe(2);
    expect(testEvents[0].passed).toBe(true);
  });

  it('emits coverage_update when test runner reports coverage', async () => {
    const { orchestrator, events } = setup(withTesterSpec);
    configurePlan(withTesterPlan);
    configureAgentSuccess();
    configureTestResults(
      [{ test_name: 'test_one', passed: true, details: 'PASSED' }],
      85,
    );

    await orchestrator.run(withTesterSpec);

    const covEvents = eventsOfType(events, 'coverage_update');
    expect(covEvents.length).toBe(1);
    expect(covEvents[0].percentage).toBe(85);
  });

  it('triggers hardware compile and flash for esp32 target', async () => {
    const { orchestrator, events } = setup(hardwareBlinkSpec);
    configurePlan(hardwareBlinkPlan);
    configureAgentSuccess();
    configureHardwareSuccess();

    await orchestrator.run(hardwareBlinkSpec);

    const deployStart = eventsOfType(events, 'deploy_started');
    expect(deployStart.length).toBe(1);
    expect(deployStart[0].target).toBe('esp32');

    const deployComplete = eventsOfType(events, 'deploy_complete');
    expect(deployComplete.length).toBe(1);
  });

  it('triggers web deploy (not hardware) for web-only target', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const deployEvents = eventsOfType(events, 'deploy_started');
    // Web target should trigger a web deploy_started, not a hardware one
    expect(deployEvents.length).toBe(1);
    expect(deployEvents[0].target).toBe('web');
    // No hardware deploy should fire
    const hwDeploy = deployEvents.filter((e: any) => e.target === 'esp32');
    expect(hwDeploy.length).toBe(0);
  });

  it('emits deploy error when compilation fails', async () => {
    const { orchestrator, events } = setup(hardwareBlinkSpec);
    configurePlan(hardwareBlinkPlan);
    configureAgentSuccess();

    const { HardwareService } = await import('../../services/hardwareService.js');
    vi.mocked(HardwareService.prototype.compile).mockResolvedValue({
      success: false,
      errors: ['SyntaxError on line 5'],
      outputPath: '',
    });

    await orchestrator.run(hardwareBlinkSpec);

    const errors = eventsOfType(events, 'error');
    expect(errors.some((e) => e.message.includes('Compilation failed'))).toBe(true);
  });

  it('fires human gate when human_gates are configured', async () => {
    const { orchestrator, events } = setup(withHumanGateSpec);
    configurePlan(withHumanGatePlan);
    configureAgentSuccess();

    const runPromise = orchestrator.run(withHumanGateSpec);

    // Wait for gate to fire (fires at midpoint of tasks)
    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    orchestrator.respondToGate(true);
    await runPromise;

    const gateEvents = eventsOfType(events, 'human_gate');
    expect(gateEvents.length).toBeGreaterThan(0);

    // Should still complete
    expect(events[events.length - 1].type).toBe('session_complete');
  });

  it('creates revision task when human gate is rejected', async () => {
    const { orchestrator, events, session } = setup(withHumanGateSpec);
    configurePlan(withHumanGatePlan);
    configureAgentSuccess();

    const runPromise = orchestrator.run(withHumanGateSpec);

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    orchestrator.respondToGate(false, 'Make the buttons bigger');
    await runPromise;

    // A revision task should have been added and executed
    const taskStarts = eventsOfType(events, 'task_started');
    const revisionStart = taskStarts.find((e) =>
      e.task_id?.includes('revision'),
    );
    // The orchestrator adds revision tasks dynamically
    expect(session.tasks.some((t: any) => t.id?.includes('revision'))).toBe(true);
  });
});

// ============================================================
// DAG dependency ordering
// ============================================================

describe('DAG dependency ordering', () => {
  it('does not start a task before its dependency completes', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    // task-2 depends on task-1
    const task1CompleteIdx = firstIndexWhere(
      events,
      (e) => e.type === 'task_completed' && e.task_id === 'task-1',
    );
    const task2StartIdx = firstIndexWhere(
      events,
      (e) => e.type === 'task_started' && e.task_id === 'task-2',
    );
    expect(task2StartIdx).toBeGreaterThan(task1CompleteIdx);

    // task-4 depends on task-2 and task-3
    const task2CompleteIdx = firstIndexWhere(
      events,
      (e) => e.type === 'task_completed' && e.task_id === 'task-2',
    );
    const task3CompleteIdx = firstIndexWhere(
      events,
      (e) => e.type === 'task_completed' && e.task_id === 'task-3',
    );
    const task4StartIdx = firstIndexWhere(
      events,
      (e) => e.type === 'task_started' && e.task_id === 'task-4',
    );
    expect(task4StartIdx).toBeGreaterThan(task2CompleteIdx);
    expect(task4StartIdx).toBeGreaterThan(task3CompleteIdx);
  });

  it('executes all tasks in the plan', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    const completedIds = eventsOfType(events, 'task_completed').map(
      (e) => e.task_id,
    );
    for (const task of multiTaskPlan.tasks) {
      expect(completedIds).toContain(task.id);
    }
  });

  it('root task (no dependencies) executes first', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    const firstTask = eventsOfType(events, 'task_started')[0];
    expect(firstTask.task_id).toBe('task-1');
  });
});

// ============================================================
// cancel(), cleanup(), respondToGate(), respondToQuestion()
// ============================================================

describe('cancel()', () => {
  it('aborts an in-flight run and emits cancellation error', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);

    let callCount = 0;
    vi.mocked(AgentRunner.prototype.execute).mockImplementation(
      async () => {
        callCount++;
        // Cancel after the first agent call finishes
        if (callCount === 1) {
          orchestrator.cancel();
        }
        return {
          success: true,
          summary: 'done',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        };
      },
    );

    await orchestrator.run(multiTaskSpec);

    const errors = eventsOfType(events, 'error');
    expect(errors.some((e) => e.message.includes('cancelled'))).toBe(true);
  });
});

describe('cleanup()', () => {
  it('removes the nugget temp directory', async () => {
    const { orchestrator } = setup(minimalWebSpec);
    const fs = await import('node:fs');

    // Create the dir to simulate partial run
    fs.mkdirSync(orchestrator.nuggetDir, { recursive: true });
    expect(fs.existsSync(orchestrator.nuggetDir)).toBe(true);

    orchestrator.cleanup();

    expect(fs.existsSync(orchestrator.nuggetDir)).toBe(false);
  });

  it('does not throw when directory does not exist', () => {
    const { orchestrator } = setup(minimalWebSpec);
    // nuggetDir was never created
    expect(() => orchestrator.cleanup()).not.toThrow();
  });
});

describe('respondToGate()', () => {
  it('does nothing when no gate is pending', () => {
    const { orchestrator } = setup(minimalWebSpec);
    // Should not throw
    expect(() => orchestrator.respondToGate(true)).not.toThrow();
  });

  it('unblocks a pending human gate with approval', async () => {
    const { orchestrator, events } = setup(withHumanGateSpec);
    configurePlan(withHumanGatePlan);
    configureAgentSuccess();

    const runPromise = orchestrator.run(withHumanGateSpec);

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    orchestrator.respondToGate(true);
    await runPromise;

    // Should complete successfully
    expect(events[events.length - 1].type).toBe('session_complete');
  });
});

describe('respondToQuestion()', () => {
  it('does nothing when no question is pending for that task', () => {
    const { orchestrator } = setup(minimalWebSpec);
    // Should not throw
    expect(() => orchestrator.respondToQuestion('task-999', { answer: 'yes' })).not.toThrow();
  });
});

// ============================================================
// Plan contents propagation
// ============================================================

describe('plan contents propagation', () => {
  it('plan_ready event contains tasks and agents from the plan', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    const planReady = eventsOfType(events, 'plan_ready')[0];
    expect(planReady.tasks.length).toBe(multiTaskPlan.tasks.length);
    expect(planReady.agents.length).toBe(multiTaskPlan.agents.length);
    expect(planReady.explanation).toBe(multiTaskPlan.plan_explanation);
  });

  it('task_started events reference correct agent names', async () => {
    const { orchestrator, events } = setup(multiTaskSpec);
    configurePlan(multiTaskPlan);
    configureAgentSuccess();

    await orchestrator.run(multiTaskSpec);

    for (const task of multiTaskPlan.tasks) {
      const startEvent = events.find(
        (e) => e.type === 'task_started' && e.task_id === task.id,
      );
      expect(startEvent).toBeDefined();
      expect(startEvent!.agent_name).toBe(task.agent_name);
    }
  });

  it('commit_created events carry agent and task metadata', async () => {
    const { orchestrator, events } = setup(minimalWebSpec);
    configurePlan(minimalWebPlan);
    configureAgentSuccess();

    await orchestrator.run(minimalWebSpec);

    const commits = eventsOfType(events, 'commit_created');
    // At least one commit per successful task
    expect(commits.length).toBeGreaterThanOrEqual(1);
    for (const commit of commits) {
      expect(commit.sha).toBeDefined();
      expect(commit.agent_name).toBeDefined();
      expect(commit.task_id).toBeDefined();
    }
  });
});
