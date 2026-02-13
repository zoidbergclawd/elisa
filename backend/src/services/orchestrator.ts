/** Orchestrates the build pipeline: planning, execution, testing, deployment. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildSession, CommitInfo } from '../models/session.js';
import type { PhaseContext } from './phases/types.js';
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

type SendEvent = (event: Record<string, any>) => Promise<void>;

export class Orchestrator {
  private session: BuildSession;
  private send: SendEvent;
  private logger: SessionLogger | null = null;
  nuggetDir: string;
  private nuggetType = 'software';
  private testResults: Record<string, any> = {};
  private commits: CommitInfo[] = [];
  private serialHandle: { close: () => void } | null = null;

  // Cancellation
  private abortController = new AbortController();

  // Gate: Promise-based blocking
  private gateResolver: { current: ((value: Record<string, any>) => void) | null } = { current: null };

  // Question: Promise-based blocking for interactive questions
  private questionResolvers = new Map<string, (answers: Record<string, any>) => void>();

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

  // Phase handlers
  private planPhase: PlanPhase;
  private testPhase: TestPhase;
  private deployPhase: DeployPhase;

  constructor(session: BuildSession, sendEvent: SendEvent, hardwareService?: HardwareService) {
    this.session = session;
    this.send = sendEvent;
    this.nuggetDir = path.join(os.tmpdir(), `elisa-nugget-${session.id}`);
    this.hardwareService = hardwareService ?? new HardwareService();
    this.portalService = new PortalService(this.hardwareService);

    this.planPhase = new PlanPhase(new MetaPlanner(), this.teachingEngine);
    this.testPhase = new TestPhase(this.testRunner, this.teachingEngine);
    this.deployPhase = new DeployPhase(
      this.hardwareService,
      this.portalService,
      this.teachingEngine,
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

  async run(spec: Record<string, any>): Promise<void> {
    try {
      const ctx = this.makeContext();

      // Plan
      const planResult = await this.planPhase.execute(ctx, spec);
      this.nuggetType = planResult.nuggetType;

      // Initialize portals if needed
      const updatedCtx = this.makeContext();
      if (this.deployPhase.shouldDeployPortals(updatedCtx)) {
        await this.deployPhase.initializePortals(updatedCtx);
      }

      // Execute
      this.permissionPolicy = new PermissionPolicy(
        this.nuggetDir,
        (spec as any).permissions ?? {},
      );
      this.narratorService.reset();

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
      });

      // Logger is initialized by setupWorkspace inside executePhase
      const executeResult = await executePhase.execute(this.makeContext());
      this.commits = executeResult.commits;

      // After workspace setup, logger is available -- update context
      // (logger was created inside executePhase.setupWorkspace)
      this.logger = new SessionLogger(this.nuggetDir);

      // Test
      await this.testPhase.execute(this.makeContext());

      // Deploy
      const deployCtx = this.makeContext();
      if (this.deployPhase.shouldDeployPortals(deployCtx)) {
        const { serialHandle } = await this.deployPhase.deployPortals(deployCtx);
        this.serialHandle = serialHandle;
      } else if (this.deployPhase.shouldDeployHardware(deployCtx)) {
        const { serialHandle } = await this.deployPhase.deployHardware(deployCtx);
        this.serialHandle = serialHandle;
      }

      // Complete
      await this.complete(planResult.tasks, planResult.agents);
    } catch (err: any) {
      console.error('Orchestrator error:', err);
      this.logger?.error('Orchestrator error', {
        message: String(err.message || err),
        stack: err.stack,
      });
      await this.send({
        type: 'error',
        message: String(err.message || err),
        recoverable: false,
      });
    } finally {
      await this.deployPhase.teardown();
    }
  }

  // -- Completion --

  private async complete(
    tasks: Record<string, any>[],
    agents: Record<string, any>[],
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

    await this.send({
      type: 'session_complete',
      summary: summaryParts.join(' '),
    });
  }

  /** Signal cancellation to the execution loop. */
  cancel(): void {
    this.abortController.abort();
  }

  /** Clean up the nugget temp directory immediately. */
  cleanup(): void {
    try {
      if (fs.existsSync(this.nuggetDir)) {
        fs.rmSync(this.nuggetDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  respondToGate(approved: boolean, feedback = ''): void {
    if (this.gateResolver.current) {
      this.gateResolver.current({ approved, feedback });
      this.gateResolver.current = null;
    }
  }

  respondToQuestion(taskId: string, answers: Record<string, any>): void {
    const resolver = this.questionResolvers.get(taskId);
    if (resolver) {
      resolver(answers);
      this.questionResolvers.delete(taskId);
    }
  }

  // -- Public accessors --

  getCommits(): Record<string, any>[] {
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

  getTestResults(): Record<string, any> {
    return this.testResults;
  }
}
