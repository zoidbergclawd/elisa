/** Test helpers for orchestrator behavioral tests. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import type { BuildSession } from '../../models/session.js';
import { Orchestrator } from '../../services/orchestrator.js';
import { MetaPlanner } from '../../services/metaPlanner.js';
import { AgentRunner } from '../../services/agentRunner.js';
import { GitService } from '../../services/gitService.js';
import { TestRunner } from '../../services/testRunner.js';
import { TeachingEngine } from '../../services/teachingEngine.js';
import { HardwareService } from '../../services/hardwareService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -- Fixture loading --

export function loadSpec(name: string): Record<string, any> {
  const p = path.join(__dirname, '..', 'fixtures', 'specs', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function loadPlan(name: string): Record<string, any> {
  const p = path.join(__dirname, '..', 'fixtures', 'plans', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// -- Event capture --

export interface EventCapture {
  events: Record<string, any>[];
  send: (event: Record<string, any>) => Promise<void>;
}

export function createEventCapture(): EventCapture {
  const events: Record<string, any>[] = [];
  const send = async (event: Record<string, any>) => {
    events.push(event);
  };
  return { events, send };
}

// -- Orchestrator factory --

export interface TestOrchestrator {
  orchestrator: Orchestrator;
  events: Record<string, any>[];
  session: BuildSession;
}

export function createTestOrchestrator(spec: Record<string, any>): TestOrchestrator {
  const { events, send } = createEventCapture();
  const session: BuildSession = {
    id: 'test-session',
    state: 'idle',
    spec,
    tasks: [],
    agents: [],
  };
  const orchestrator = new Orchestrator(session, send);
  return { orchestrator, events, session };
}

// -- Mock configuration helpers --

export function configurePlan(plan: Record<string, any>): void {
  vi.mocked(MetaPlanner.prototype.plan).mockResolvedValue(plan);
}

export function configureAgentSuccess(summary = 'Task completed successfully'): void {
  vi.mocked(AgentRunner.prototype.execute).mockResolvedValue({
    success: true,
    summary,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });
}

export function configureAgentFailure(summary = 'Task failed'): void {
  vi.mocked(AgentRunner.prototype.execute).mockResolvedValue({
    success: false,
    summary,
    inputTokens: 50,
    outputTokens: 20,
    costUsd: 0.005,
  });
}

export function configureHardwareSuccess(): void {
  vi.mocked(HardwareService.prototype.compile).mockResolvedValue({
    success: true,
    errors: [],
    outputPath: '/tmp/compiled',
  });
  vi.mocked(HardwareService.prototype.flash).mockResolvedValue({
    success: true,
    message: 'Flashed successfully',
  });
  vi.mocked(HardwareService.prototype.detectBoard).mockResolvedValue(null);
}

export function configureTestResults(
  tests: Array<{ test_name: string; passed: boolean; details: string }>,
  coveragePct: number | null = null,
): void {
  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;
  vi.mocked(TestRunner.prototype.runTests).mockResolvedValue({
    tests,
    passed,
    failed,
    total: passed + failed,
    coverage_pct: coveragePct,
    coverage_details: null,
  });
}

// -- Mock defaults (call in beforeEach) --

export function setMockDefaults(): void {
  vi.mocked(MetaPlanner.prototype.plan).mockResolvedValue({
    tasks: [],
    agents: [],
    plan_explanation: '',
  });

  vi.mocked(AgentRunner.prototype.execute).mockResolvedValue({
    success: true,
    summary: 'Done',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });

  vi.mocked(GitService.prototype.initRepo).mockResolvedValue(undefined as any);
  vi.mocked(GitService.prototype.commit).mockResolvedValue({
    sha: 'abc1234567890',
    shortSha: 'abc1234',
    message: 'test commit',
    agentName: 'Builder Bot',
    taskId: 'task-1',
    timestamp: new Date().toISOString(),
    filesChanged: ['src/index.ts'],
  });

  vi.mocked(TestRunner.prototype.runTests).mockResolvedValue({
    tests: [],
    passed: 0,
    failed: 0,
    total: 0,
    coverage_pct: null,
    coverage_details: null,
  });

  vi.mocked(TeachingEngine.prototype.getMoment).mockResolvedValue(null);
  vi.mocked(TeachingEngine.prototype.getShownConcepts).mockReturnValue([]);

  vi.mocked(HardwareService.prototype.compile).mockResolvedValue({
    success: false,
    errors: ['not configured'],
    outputPath: '',
  });
  vi.mocked(HardwareService.prototype.flash).mockResolvedValue({
    success: false,
    message: 'not configured',
  });
  vi.mocked(HardwareService.prototype.detectBoard).mockResolvedValue(null);
  vi.mocked(HardwareService.prototype.startSerialMonitor).mockResolvedValue({
    close: () => {},
  });
}

// -- Event query helpers --

export function eventTypes(events: Record<string, any>[]): string[] {
  return events.map((e) => e.type);
}

export function eventsOfType(
  events: Record<string, any>[],
  type: string,
): Record<string, any>[] {
  return events.filter((e) => e.type === type);
}

export function firstIndexOf(events: Record<string, any>[], type: string): number {
  return events.findIndex((e) => e.type === type);
}

export function firstIndexWhere(
  events: Record<string, any>[],
  predicate: (e: Record<string, any>) => boolean,
): number {
  return events.findIndex(predicate);
}

// -- Cleanup --

export function cleanupNuggetDir(orchestrator: Orchestrator): void {
  const dir = orchestrator.nuggetDir;
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows: open handles may prevent deletion; ignore in tests
    }
  }
}
