/** Orchestrates the build pipeline: planning, execution, testing, deployment. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { BuildSession, Task, Agent, CommitInfo } from '../models/session.js';
import type { NuggetSpec } from '../utils/specValidator.js';
import type { PhaseContext, SendEvent, GateResponse, QuestionAnswers } from './phases/types.js';
import type { TestRunResult } from './testRunner.js';
import { PlanPhase } from './phases/planPhase.js';
import { ExecutePhase } from './phases/executePhase.js';
import { TestPhase } from './phases/testPhase.js';
import { DeployPhase } from './phases/deployPhase.js';
import { AgentRunner } from './agentRunner.js';
import { GitService } from './gitService.js';
import { HardwareService } from './hardwareService.js';
import { MetaPlanner } from './metaPlanner.js';
import { PortalService } from './portalService.js';
import { TeachingEngine } from './teachingEngine.js';
import { TestRunner } from './testRunner.js';
import { NarratorService } from './narratorService.js';
import { PermissionPolicy } from './permissionPolicy.js';
import { ContextManager } from '../utils/contextManager.js';
import { SessionLogger } from '../utils/sessionLogger.js';
import { TokenTracker } from '../utils/tokenTracker.js';
import { DeviceRegistry } from './deviceRegistry.js';
import { TraceabilityTracker } from './traceabilityTracker.js';
import { FeedbackLoopTracker } from './feedbackLoopTracker.js';
import { HealthTracker } from './healthTracker.js';
import { HealthHistoryService } from './healthHistoryService.js';
import { autoMatchTests } from './autoTestMatcher.js';
import { MeetingTriggerWiring } from './meetingTriggerWiring.js';
import { getLevel } from './systemLevelService.js';
import type { SystemLevel } from './systemLevelService.js';
import type { MeetingService } from './meetingService.js';
import type { RuntimeProvisioner } from './runtimeProvisioner.js';
import type { SpecGraphService } from './specGraph.js';

export class Orchestrator {
  private session: BuildSession;
  private send: SendEvent;
  private logger: SessionLogger | null = null;
  nuggetDir: string;
  private nuggetType = 'software';
  private testResults: TestRunResult = { tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null };
  private commits: CommitInfo[] = [];
  private webServerProcess: ChildProcess | null = null;
  private userWorkspace: boolean;

  // Cancellation
  private abortController = new AbortController();

  // Gate: Promise-based blocking
  private gateResolver: { current: ((value: GateResponse) => void) | null } = { current: null };

  // Question: Promise-based blocking for interactive questions
  private questionResolvers = new Map<string, (answers: QuestionAnswers) => void>();

  // Meeting block: tasks wait for meetings to end/decline before proceeding
  private meetingBlockResolvers = new Map<string, () => void>();

  // Services
  private agentRunner = new AgentRunner();
  private git: GitService | null = new GitService();
  private context = new ContextManager();
  private tokenTracker = new TokenTracker();
  private teachingEngine = new TeachingEngine();
  private testRunner = new TestRunner();
  private hardwareService: HardwareService;
  private portalService: PortalService;
  private narratorService = new NarratorService();
  private permissionPolicy: PermissionPolicy | null = null;
  private deviceRegistry: DeviceRegistry;
  private traceabilityTracker = new TraceabilityTracker();
  private healthTracker = new HealthTracker();
  private meetingRegistry?: import('./meetingRegistry.js').MeetingRegistry;
  private meetingTriggerWiring?: MeetingTriggerWiring;
  private meetingService?: MeetingService;

  // Phase handlers
  private planPhase: PlanPhase;
  private testPhase: TestPhase;
  private deployPhase: DeployPhase;

  constructor(session: BuildSession, sendEvent: SendEvent, hardwareService?: HardwareService, workspacePath?: string, deviceRegistry?: DeviceRegistry, meetingRegistry?: import('./meetingRegistry.js').MeetingRegistry, runtimeProvisioner?: RuntimeProvisioner, specGraphService?: SpecGraphService, meetingService?: MeetingService) {
    this.session = session;
    this.send = sendEvent;
    this.nuggetDir = workspacePath || path.join(os.tmpdir(), `elisa-nugget-${session.id}`);
    this.userWorkspace = !!workspacePath;
    this.hardwareService = hardwareService ?? new HardwareService();
    this.portalService = new PortalService();
    this.deviceRegistry = deviceRegistry ?? new DeviceRegistry(path.resolve(import.meta.dirname, '../../devices'));
    this.meetingRegistry = meetingRegistry;
    this.meetingService = meetingService;
    if (meetingRegistry && meetingService) {
      this.meetingTriggerWiring = new MeetingTriggerWiring(meetingRegistry, meetingService);
    }

    this.planPhase = new PlanPhase(new MetaPlanner(), this.teachingEngine, this.deviceRegistry, specGraphService);
    this.testPhase = new TestPhase(this.testRunner, this.teachingEngine);
    this.deployPhase = new DeployPhase(
      this.hardwareService,
      this.portalService,
      this.teachingEngine,
      this.deviceRegistry,
      runtimeProvisioner,
    );
  }

  private makeContext(): PhaseContext {
    return {
      session: this.session,
      send: this.send,
      logger: this.logger,
      nuggetDir: this.nuggetDir,
      nuggetType: this.nuggetType,
      abortSignal: this.abortController.signal,
    };
  }

  async run(spec: NuggetSpec): Promise<void> {
    try {
      const ctx = this.makeContext();

      // Auto-match tests at Explorer level (before planning)
      await autoMatchTests(spec, this.send);

      // Plan
      const planResult = await this.planPhase.execute(ctx, spec);
      this.nuggetType = planResult.nuggetType;

      // Evaluate meeting triggers after planning (mid-build)
      const systemLevel = getLevel(spec);
      // Derive device types from plugin IDs (e.g. 'esp32-s3-box3-agent' -> board variant 'box-3' via registry)
      const deviceTypes: string[] = [];
      for (const d of spec.devices ?? []) {
        const manifest = this.deviceRegistry.getDevice(d.pluginId);
        if (manifest?.board?.variant) deviceTypes.push(manifest.board.variant);
        else if (manifest?.board?.type) deviceTypes.push(manifest.board.type);
        else deviceTypes.push(d.pluginId);
      }
      await this.meetingTriggerWiring?.evaluateAndInvite(
        'plan_ready',
        {
          tasks: planResult.tasks.map(t => ({ id: t.id, title: t.name, agent: t.agent_name })),
          agents: planResult.agents.map(a => ({ name: a.name, role: a.role })),
          task_count: planResult.tasks.length,
          spec_goal: spec.nugget?.goal ?? '',
          has_devices: !!spec.devices?.length,
          device_types: deviceTypes,
        },
        this.session.id,
        this.send,
        systemLevel,
      );

      // Build traceability map from spec requirements and behavioral tests
      this.traceabilityTracker.buildMap(
        spec.requirements,
        spec.workflow?.behavioral_tests,
      );

      // Initialize portals if needed
      const updatedCtx = this.makeContext();
      if (this.deployPhase.shouldDeployPortals(updatedCtx)) {
        await this.deployPhase.initializePortals(updatedCtx);
      }

      // Execute
      this.permissionPolicy = new PermissionPolicy(
        this.nuggetDir,
        spec.permissions ?? {},
      );
      this.narratorService.reset();

      const feedbackLoopTracker = new FeedbackLoopTracker(this.send, this.meetingRegistry);

      const executePhase = new ExecutePhase({
        agentRunner: this.agentRunner,
        git: this.git,
        teachingEngine: this.teachingEngine,
        tokenTracker: this.tokenTracker,
        portalService: this.portalService,
        context: this.context,
        tasks: planResult.tasks,
        agents: planResult.agents,
        taskMap: planResult.taskMap,
        agentMap: planResult.agentMap,
        dag: planResult.dag,
        questionResolvers: this.questionResolvers,
        gateResolver: this.gateResolver,
        narratorService: this.narratorService,
        permissionPolicy: this.permissionPolicy,
        deviceRegistry: this.deviceRegistry,
        feedbackLoopTracker,
        meetingTriggerWiring: this.meetingTriggerWiring,
        meetingService: this.meetingService,
        meetingBlockResolvers: this.meetingBlockResolvers,
        sessionId: this.session.id,
        systemLevel,
      });

      // Initialize logger before execute so plan and execute phases get logging
      this.logger = new SessionLogger(this.nuggetDir);

      // Initialize health tracker with task count
      this.healthTracker.setTasksTotal(planResult.tasks.length);

      const executeResult = await executePhase.execute(this.makeContext());
      this.commits = executeResult.commits;

      // Update health tracker with execution results
      const doneTasks = planResult.tasks.filter(t => t.status === 'done').length;
      for (let i = 0; i < doneTasks; i++) this.healthTracker.recordTaskDone();
      this.healthTracker.recordTokenUsage(
        this.tokenTracker.total,
        this.tokenTracker.maxBudget,
      );
      // Emit health update after execution
      await this.healthTracker.emitUpdate(this.send);

      // Test
      const testResult = await this.testPhase.execute(this.makeContext());

      // Traceability: update tracker with test results and emit summary
      if (this.traceabilityTracker.hasRequirements()) {
        const testCtx = this.makeContext();
        const tests = testResult.testResults?.tests ?? [];
        for (const test of tests) {
          const update = this.traceabilityTracker.recordTestResult(test.test_name, test.passed);
          if (update) {
            await testCtx.send({
              type: 'traceability_update',
              requirement_id: update.requirement_id,
              test_id: update.test_id,
              status: update.status,
            });
          }
        }
        await this.traceabilityTracker.emitSummary(testCtx.send);
      }

      // Update health tracker with test results
      const testResults = testResult.testResults?.tests ?? [];
      const testsPassing = testResults.filter((t: { passed: boolean }) => t.passed).length;
      this.healthTracker.recordTestResults(testsPassing, testResults.length);
      // Emit final health summary
      await this.healthTracker.emitUpdate(this.send);
      await this.healthTracker.emitSummary(this.send);

      // Write test/health results to session for meeting context
      this.session.testResults = { passed: testsPassing, total: testResults.length };

      // Health history: load, record current build, emit, persist
      const healthHistory = new HealthHistoryService(this.nuggetDir);
      healthHistory.load();
      const healthSummary = this.healthTracker.getSummary();
      this.session.healthSummary = { score: healthSummary.health_score, grade: healthSummary.grade };
      healthHistory.record(spec.nugget?.goal ?? 'Build', healthSummary);
      await healthHistory.emitHistory(this.send);

      // Deploy
      console.log('[orchestrator] entering deploy phase');
      console.log('[orchestrator] session.spec.devices:', JSON.stringify(this.session.spec?.devices ?? null));
      console.log('[orchestrator] session.spec.deployment:', JSON.stringify(this.session.spec?.deployment ?? null));
      const deployCtx = this.makeContext();
      if (this.deployPhase.shouldDeployDevices(deployCtx)) {
        console.log('[orchestrator] deploying devices...');
        // Evaluate meeting triggers for device deploy
        await this.meetingTriggerWiring?.evaluateAndInvite(
          'deploy_started',
          { target: 'devices', devices: spec.devices ?? [] },
          this.session.id,
          this.send,
          systemLevel,
        );
        await this.deployPhase.deployDevices(deployCtx, this.gateResolver);
        console.log('[orchestrator] device deploy finished');
      }
      if (this.deployPhase.shouldDeployWeb(deployCtx)) {
        console.log('[orchestrator] deploying web...');
        // Evaluate meeting triggers for web deploy
        await this.meetingTriggerWiring?.evaluateAndInvite(
          'deploy_started',
          { target: 'web' },
          this.session.id,
          this.send,
          systemLevel,
        );
        const { process: webProc } = await this.deployPhase.deployWeb(deployCtx);
        this.webServerProcess = webProc;
        console.log('[orchestrator] web deploy finished, process:', webProc ? 'running' : 'null');
      } else if (this.deployPhase.shouldDeployPortals(deployCtx)) {
        console.log('[orchestrator] deploying portals...');
        await this.deployPhase.deployPortals(deployCtx);
        console.log('[orchestrator] portal deploy finished');
      }

      // Complete
      await this.complete(planResult.tasks, planResult.agents, spec);
    } catch (err: unknown) {
      console.error('Orchestrator error:', err);
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger?.error('Orchestrator error', {
        message,
        stack,
      });
      this.session.state = 'done';
      await this.send({
        type: 'error',
        message,
        recoverable: false,
      });
    } finally {
      await this.deployPhase.teardown();
      this.logger?.close();
    }
  }

  // -- Completion --

  private async complete(
    tasks: Task[],
    agents: Agent[],
    spec?: NuggetSpec,
  ): Promise<void> {
    this.session.state = 'done';
    this.logger?.phase('done');
    for (const agent of agents) agent.status = 'done';

    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const total = tasks.length;
    const failedCount = tasks.filter((t) => t.status === 'failed').length;

    this.logger?.sessionSummary(doneCount, failedCount, total);

    const summaryParts = [`Completed ${doneCount}/${total} tasks.`];
    if (failedCount) summaryParts.push(`${failedCount} task(s) failed.`);

    const shown = this.teachingEngine.getShownConcepts();
    if (shown.length) {
      const conceptNames = shown.map((c) => c.split(':')[0]);
      const unique = [...new Set(conceptNames)];
      summaryParts.push(`Concepts learned: ${unique.join(', ')}`);
    }

    // Evaluate meeting triggers for session_complete (before sending the event)
    if (spec) {
      const systemLevel = getLevel(spec);
      await this.meetingTriggerWiring?.evaluateAndInvite(
        'session_complete',
        {
          tasks_done: doneCount,
          tasks_total: total,
          tasks_failed: failedCount,
          tests_passing: this.session.testResults?.passed ?? 0,
          tests_total: this.session.testResults?.total ?? 0,
          health_score: this.session.healthSummary?.score ?? 0,
        },
        this.session.id,
        this.send,
        systemLevel,
      );
    }

    await this.send({
      type: 'session_complete',
      summary: summaryParts.join(' '),
    });
  }

  /** Signal cancellation to the execution loop and release resources. */
  cancel(): void {
    this.abortController.abort();
  }

  /** Clean up the nugget temp directory immediately (skipped for user workspaces). */
  cleanup(): void {
    // Kill web server process if running
    if (this.webServerProcess) {
      try { this.webServerProcess.kill(); } catch { /* ignore */ }
      this.webServerProcess = null;
    }
    // Skip directory cleanup for user-chosen workspaces
    if (this.userWorkspace) return;
    try {
      if (fs.existsSync(this.nuggetDir)) {
        fs.rmSync(this.nuggetDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  /** Resolve a meeting block, allowing the blocked task to proceed. */
  resolveMeetingBlock(meetingId: string): void {
    const resolver = this.meetingBlockResolvers.get(meetingId);
    if (resolver) {
      resolver();
      this.meetingBlockResolvers.delete(meetingId);
    }
  }

  /** Session ID accessor for external callers (e.g. route handlers). */
  get sessionId(): string {
    return this.session.id;
  }

  respondToGate(approved: boolean, feedback = ''): void {
    if (this.gateResolver.current) {
      this.gateResolver.current({ approved, feedback });
      this.gateResolver.current = null;
    }
  }

  respondToQuestion(taskId: string, answers: QuestionAnswers): void {
    const resolver = this.questionResolvers.get(taskId);
    if (resolver) {
      resolver(answers);
      this.questionResolvers.delete(taskId);
    }
  }

  // -- Public accessors --

  /** Returns commits serialized as snake_case for the REST API. */
  getCommits(): Array<{
    sha: string;
    short_sha: string;
    message: string;
    agent_name: string;
    task_id: string;
    timestamp: string;
    files_changed: string[];
  }> {
    return this.commits.map((c) => ({
      sha: c.sha,
      short_sha: c.shortSha,
      message: c.message,
      agent_name: c.agentName,
      task_id: c.taskId,
      timestamp: c.timestamp,
      files_changed: c.filesChanged,
    }));
  }

  getTestResults(): TestRunResult {
    return this.testResults;
  }
}
