/** Orchestrates the build pipeline: planning, execution, testing, deployment. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildSession, CommitInfo, SessionState, QuestionPayload } from '../models/session.js';
import * as builderAgent from '../prompts/builderAgent.js';
import * as testerAgent from '../prompts/testerAgent.js';
import * as reviewerAgent from '../prompts/reviewerAgent.js';
import { AgentRunner } from './agentRunner.js';
import { GitService } from './gitService.js';
import { HardwareService } from './hardwareService.js';
import { MetaPlanner } from './metaPlanner.js';
import { PortalService } from './portalService.js';
import { TeachingEngine } from './teachingEngine.js';
import { TestRunner } from './testRunner.js';
import { ContextManager } from '../utils/contextManager.js';
import { TaskDAG } from '../utils/dag.js';
import { TokenTracker } from '../utils/tokenTracker.js';

type SendEvent = (event: Record<string, any>) => Promise<void>;

interface PromptModule {
  SYSTEM_PROMPT: string;
  formatTaskPrompt: (params: {
    agentName: string;
    role: string;
    persona: string;
    task: Record<string, any>;
    spec: Record<string, any>;
    predecessors: string[];
    style?: Record<string, any> | null;
  }) => string;
}

const PROMPT_MODULES: Record<string, PromptModule> = {
  builder: builderAgent,
  tester: testerAgent,
  reviewer: reviewerAgent,
  custom: builderAgent,
};

export class Orchestrator {
  private session: BuildSession;
  private send: SendEvent;
  private metaPlanner = new MetaPlanner();
  private agentRunner = new AgentRunner();
  private dag = new TaskDAG();
  private tasks: Record<string, any>[] = [];
  private agents: Record<string, any>[] = [];
  private taskMap: Record<string, Record<string, any>> = {};
  private agentMap: Record<string, Record<string, any>> = {};
  private taskSummaries: Record<string, string> = {};
  nuggetDir = path.join(os.tmpdir(), `elisa-nugget-${Date.now()}`);
  private git: GitService | null = new GitService();
  private context = new ContextManager();
  private commits: CommitInfo[] = [];
  private tokenTracker = new TokenTracker();
  private teachingEngine = new TeachingEngine();
  private testRunner = new TestRunner();
  private hardwareService = new HardwareService();
  private portalService = new PortalService(this.hardwareService);
  private nuggetType = 'software';
  private testResults: Record<string, any> = {};
  private serialHandle: { close: () => void } | null = null;

  // Gate: Promise-based blocking (replaces Python asyncio.Event)
  private gateResolver: ((value: Record<string, any>) => void) | null = null;

  // Question: Promise-based blocking for interactive questions
  private questionResolvers = new Map<string, (answers: Record<string, any>) => void>();

  constructor(session: BuildSession, sendEvent: SendEvent) {
    this.session = session;
    this.send = sendEvent;
  }

  async run(spec: Record<string, any>): Promise<void> {
    try {
      await this.plan(spec);
      if (this.shouldDeployPortals()) {
        await this.initializePortals();
      }
      await this.execute();
      await this.runTests();
      if (this.shouldDeployPortals()) {
        await this.deployPortals();
      } else if (this.shouldDeployHardware()) {
        await this.deployHardware();
      }
      await this.complete();
    } catch (err: any) {
      console.error('Orchestrator error:', err);
      await this.send({
        type: 'error',
        message: String(err.message || err),
        recoverable: false,
      });
    } finally {
      await this.portalService.teardownAll();
    }
  }

  // -- Planning --

  private async plan(spec: Record<string, any>): Promise<void> {
    this.session.state = 'planning';
    await this.send({ type: 'planning_started' });

    this.nuggetType =
      (this.session.spec ?? {}).nugget?.type ?? 'software';

    const plan = await this.metaPlanner.plan(spec);

    this.tasks = plan.tasks;
    this.agents = plan.agents;
    this.taskMap = Object.fromEntries(this.tasks.map((t) => [t.id, t]));
    this.agentMap = Object.fromEntries(this.agents.map((a) => [a.name, a]));

    for (const task of this.tasks) task.status ??= 'pending';
    for (const agent of this.agents) agent.status ??= 'idle';

    for (const task of this.tasks) {
      this.dag.addTask(task.id, task.dependencies ?? []);
    }

    try {
      this.dag.getOrder();
    } catch {
      await this.send({
        type: 'error',
        message:
          "Oops, some tasks depend on each other in a circle. The plan can't be executed.",
        recoverable: false,
      });
      throw new Error('Circular dependencies in task DAG');
    }

    this.session.tasks = this.tasks;
    this.session.agents = this.agents;

    const planExplanation = plan.plan_explanation ?? '';

    await this.send({
      type: 'plan_ready',
      tasks: this.tasks,
      agents: this.agents,
      explanation: planExplanation,
    });

    await this.maybeTeach('plan_ready', planExplanation);

    if (spec.skills?.length) await this.maybeTeach('skill_used', '');
    if (spec.rules?.length) await this.maybeTeach('rule_used', '');
    if (spec.portals?.length) await this.maybeTeach('portal_used', '');
  }

  // -- Execution --

  private async execute(): Promise<void> {
    this.session.state = 'executing';
    await this.setupWorkspace();

    const completed = new Set<string>();

    while (completed.size < this.tasks.length) {
      const ready = this.dag.getReady(completed);

      if (ready.length === 0) {
        await this.send({
          type: 'error',
          message: 'Some tasks are blocked and cannot proceed.',
          recoverable: false,
        });
        break;
      }

      const task = this.taskMap[ready[0]];
      const taskId = task.id;
      const agentName: string = task.agent_name ?? '';
      const agent = this.agentMap[agentName] ?? {};
      const agentRole: string = agent.role ?? 'builder';

      // Skip deploy tasks that have no concrete deployment target
      if (this.isUndeployableTask(task)) {
        task.status = 'done';
        if (agent.status !== undefined) agent.status = 'idle';
        completed.add(taskId);
        this.taskSummaries[taskId] = 'Skipped: no deployment target configured. Add a deployment portal to enable this.';
        await this.send({ type: 'task_started', task_id: taskId, agent_name: agentName });
        await this.send({
          type: 'agent_output',
          task_id: taskId,
          agent_name: agentName,
          content: 'No deployment target configured. Skipping deploy task. You can add a deployment portal later.',
        });
        await this.send({ type: 'task_completed', task_id: taskId, agent_name: agentName });
        continue;
      }

      task.status = 'in_progress';
      if (agent.status !== undefined) agent.status = 'working';

      await this.send({ type: 'task_started', task_id: taskId, agent_name: agentName });

      const promptModule = PROMPT_MODULES[agentRole] ?? builderAgent;
      let systemPrompt = promptModule.SYSTEM_PROMPT
        .replace('{agent_name}', agentName)
        .replace('{persona}', agent.persona ?? '')
        .replace('{allowed_paths}', (agent.allowed_paths ?? ['src/', 'tests/']).join(', '))
        .replace('{restricted_paths}', (agent.restricted_paths ?? ['.elisa/']).join(', '))
        .replace('{task_id}', taskId);

      // Inject agent-category skills and always-on rules
      const specData = this.session.spec ?? {};
      const agentSkills = (specData.skills ?? []).filter(
        (s: any) => s.category === 'agent',
      );
      const alwaysRules = (specData.rules ?? []).filter(
        (r: any) => r.trigger === 'always',
      );
      if (agentSkills.length || alwaysRules.length) {
        systemPrompt += "\n\n## Kid's Custom Instructions\n";
        for (const s of agentSkills) {
          systemPrompt += `### Skill: ${s.name}\n${s.prompt}\n\n`;
        }
        for (const r of alwaysRules) {
          systemPrompt += `### Rule: ${r.name}\n${r.prompt}\n\n`;
        }
      }

      // Transitive predecessors
      const allPredecessorIds = ContextManager.getTransitivePredecessors(
        taskId,
        this.taskMap,
      );
      const predecessorSummaries: string[] = [];
      for (const depId of allPredecessorIds) {
        if (this.taskSummaries[depId]) {
          predecessorSummaries.push(
            ContextManager.capSummary(this.taskSummaries[depId]),
          );
        }
      }

      let userPrompt = promptModule.formatTaskPrompt({
        agentName,
        role: agentRole,
        persona: agent.persona ?? '',
        task,
        spec: this.session.spec ?? {},
        predecessors: predecessorSummaries,
        style: this.session.spec?.style ?? null,
      });

      // Append file manifest
      const fileManifest = ContextManager.buildFileManifest(this.nuggetDir);
      if (fileManifest) {
        userPrompt += `\n\n## FILES IN WORKSPACE\n${fileManifest}`;
      }

      let retryCount = 0;
      const maxRetries = 2;
      let success = false;
      let result: any = null;

      while (!success && retryCount <= maxRetries) {
        const mcpServers = this.portalService.getMcpServers();
        result = await this.agentRunner.execute({
          taskId,
          prompt: userPrompt,
          systemPrompt,
          onOutput: this.makeOutputHandler(agentName),
          onQuestion: this.makeQuestionHandler(taskId),
          workingDir: this.nuggetDir,
          ...(mcpServers.length > 0 ? { mcpServers } : {}),
        });

        if (result.success) {
          success = true;
          this.taskSummaries[taskId] = result.summary;
        } else {
          retryCount++;
          if (retryCount <= maxRetries) {
            const onFailRules = (specData.rules ?? []).filter(
              (r: any) => r.trigger === 'on_test_fail',
            );
            if (onFailRules.length) {
              userPrompt += "\n\n## Retry Rules (kid's rules)\n";
              for (const r of onFailRules) {
                userPrompt += `### ${r.name}\n${r.prompt}\n`;
              }
            }
            await this.send({
              type: 'agent_output',
              task_id: taskId,
              agent_name: agentName,
              content: `Retrying... (attempt ${retryCount + 1})`,
            });
          }
        }
      }

      // Track tokens
      if (result) {
        this.tokenTracker.addForAgent(
          agentName,
          result.inputTokens,
          result.outputTokens,
          result.costUsd,
        );
        await this.send({
          type: 'token_usage',
          agent_name: agentName,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        });
      }

      if (success) {
        task.status = 'done';
        if (agent.status !== undefined) agent.status = 'idle';

        // Read comms file
        const commsPath = path.join(
          this.nuggetDir, '.elisa', 'comms', `${taskId}_summary.md`,
        );
        if (fs.existsSync(commsPath)) {
          try {
            this.taskSummaries[taskId] = fs.readFileSync(commsPath, 'utf-8');
          } catch { /* ignore */ }
        }

        // Emit agent_message
        if (this.taskSummaries[taskId]) {
          await this.send({
            type: 'agent_message',
            from: agentName,
            to: 'team',
            content: this.taskSummaries[taskId].slice(0, 500),
          });
        }

        // Update nugget_context.md
        const contextPath = path.join(
          this.nuggetDir, '.elisa', 'context', 'nugget_context.md',
        );
        const contextText = ContextManager.buildNuggetContext(
          this.taskSummaries,
          new Set([...completed, taskId]),
        );
        fs.writeFileSync(contextPath, contextText, 'utf-8');

        // Update current_state.json
        const statePath = path.join(
          this.nuggetDir, '.elisa', 'status', 'current_state.json',
        );
        const state = ContextManager.buildCurrentState(this.tasks, this.agents);
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        // Git commit
        if (this.git) {
          const commitMsg = `${agentName}: ${task.name ?? taskId}`;
          try {
            const commitInfo = await this.git.commit(
              this.nuggetDir, commitMsg, agentName, taskId,
            );
            if (commitInfo.sha) {
              this.commits.push(commitInfo);
              await this.send({
                type: 'commit_created',
                sha: commitInfo.shortSha,
                message: commitInfo.message,
                agent_name: commitInfo.agentName,
                task_id: commitInfo.taskId,
                timestamp: commitInfo.timestamp,
                files_changed: commitInfo.filesChanged,
              });
              await this.maybeTeach('commit_created', commitMsg);
            }
          } catch {
            console.warn(`Git commit failed for ${taskId}`);
          }
        }

        await this.send({
          type: 'task_completed',
          task_id: taskId,
          summary: result?.summary ?? '',
        });

        // Teaching moments for tester/reviewer
        if (agentRole === 'tester') {
          await this.maybeTeach('tester_task_completed', result?.summary ?? '');
        } else if (agentRole === 'reviewer') {
          await this.maybeTeach('reviewer_task_completed', result?.summary ?? '');
        }

        // Check human gate
        if (this.shouldFireGate(task, completed)) {
          await this.fireHumanGate(task);
        }
      } else {
        task.status = 'failed';
        if (agent.status !== undefined) agent.status = 'error';
        await this.send({
          type: 'task_failed',
          task_id: taskId,
          error: result?.summary ?? 'Unknown error',
          retry_count: retryCount,
        });

        if (retryCount > maxRetries) {
          await this.fireHumanGate(task, {
            question: "We're having trouble with this part. Can you help us figure it out?",
            context: result?.summary ?? 'Task failed after retries',
          });
        } else {
          await this.send({
            type: 'error',
            message: `Agent couldn't complete task: ${task.name ?? taskId}`,
            recoverable: true,
          });
        }
      }

      completed.add(taskId);
    }
  }

  // -- Human Gate --

  private shouldFireGate(task: Record<string, any>, completed: Set<string>): boolean {
    const spec = this.session.spec ?? {};
    const humanGates = spec.workflow?.human_gates ?? [];
    if (humanGates.length === 0) return false;
    const midpoint = Math.floor(this.tasks.length / 2);
    const doneCount = completed.size + 1;
    return doneCount === midpoint && doneCount > 0;
  }

  private async fireHumanGate(
    task: Record<string, any>,
    opts: { question?: string; context?: string } = {},
  ): Promise<void> {
    this.session.state = 'reviewing';

    const question =
      opts.question ?? "I've made some progress. Want to take a look before I continue?";
    const context =
      opts.context ?? `Just completed: ${task.name ?? task.id}`;

    await this.send({
      type: 'human_gate',
      task_id: task.id,
      question,
      context,
    });

    // Block until REST endpoint responds
    const response = await new Promise<Record<string, any>>((resolve) => {
      this.gateResolver = resolve;
    });

    if (!response.approved) {
      const feedback = response.feedback ?? '';
      const revisionTask: Record<string, any> = {
        id: `task-revision-${task.id}`,
        name: `Revise: ${task.name ?? task.id}`,
        description: `Revise based on feedback: ${feedback}`,
        acceptance_criteria: [`Address feedback: ${feedback}`],
        dependencies: [task.id],
        agent_name: task.agent_name ?? '',
        status: 'pending',
      };
      this.tasks.push(revisionTask);
      this.taskMap[revisionTask.id] = revisionTask;
      this.dag.addTask(revisionTask.id, revisionTask.dependencies);
    }

    this.session.state = 'executing';
  }

  respondToGate(approved: boolean, feedback = ''): void {
    if (this.gateResolver) {
      this.gateResolver({ approved, feedback });
      this.gateResolver = null;
    }
  }

  // -- Interactive Questions --

  respondToQuestion(taskId: string, answers: Record<string, any>): void {
    const resolver = this.questionResolvers.get(taskId);
    if (resolver) {
      resolver(answers);
      this.questionResolvers.delete(taskId);
    }
  }

  // -- Deploy task filtering --

  /** Returns true if a task looks like a deploy task but has no concrete deployment target. */
  private isUndeployableTask(task: Record<string, any>): boolean {
    const name = (task.name ?? '').toLowerCase();
    const desc = (task.description ?? '').toLowerCase();
    const isDeployTask = name.includes('deploy') || desc.includes('deploy to the web') || desc.includes('deploy to production');
    if (!isDeployTask) return false;

    // Hardware deploy tasks are handled by the hardware service
    if (this.shouldDeployHardware()) return false;

    // Portal deploy tasks are handled by portal service
    if (this.shouldDeployPortals()) return false;

    // No concrete deployment target -- skip this task
    return true;
  }

  // -- Hardware Deployment --

  private shouldDeployHardware(): boolean {
    const spec = this.session.spec ?? {};
    const target = spec.deployment?.target ?? 'preview';
    return target === 'esp32' || target === 'both';
  }

  private async deployHardware(): Promise<void> {
    this.session.state = 'deploying';
    await this.send({ type: 'deploy_started', target: 'esp32' });

    // Log before_deploy rules
    const specData = this.session.spec ?? {};
    const deployRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'before_deploy',
    );
    if (deployRules.length) {
      const checklist = deployRules
        .map((r: any) => `- ${r.name}: ${r.prompt}`)
        .join('\n');
      console.info('Before-deploy rules:\n' + checklist);
    }

    // Step 1: Compile
    await this.send({
      type: 'deploy_progress',
      step: 'Compiling MicroPython code...',
      progress: 25,
    });
    const compileResult = await this.hardwareService.compile(this.nuggetDir);
    await this.maybeTeach('hardware_compile', '');

    if (!compileResult.success) {
      await this.send({
        type: 'deploy_progress',
        step: `Compile failed: ${compileResult.errors.join(', ')}`,
        progress: 25,
      });
      await this.send({
        type: 'error',
        message: `Compilation failed: ${compileResult.errors.join(', ')}`,
        recoverable: true,
      });
      return;
    }

    // Step 2: Flash
    await this.send({
      type: 'deploy_progress',
      step: 'Flashing to board...',
      progress: 60,
    });
    const flashResult = await this.hardwareService.flash(this.nuggetDir);
    await this.maybeTeach('hardware_flash', '');

    if (!flashResult.success) {
      await this.send({
        type: 'deploy_progress',
        step: flashResult.message,
        progress: 60,
      });
      await this.send({
        type: 'error',
        message: flashResult.message,
        recoverable: true,
      });
      return;
    }

    // Step 3: Serial monitor
    await this.send({
      type: 'deploy_progress',
      step: 'Starting serial monitor...',
      progress: 90,
    });

    const board = await this.hardwareService.detectBoard();
    if (board) {
      this.serialHandle = await this.hardwareService.startSerialMonitor(
        board.port,
        async (line: string) => {
          await this.send({
            type: 'serial_data',
            line,
            timestamp: new Date().toISOString(),
          });
        },
      );
    }

    // Hardware-specific teaching moments
    const hwComponents = (this.session.spec ?? {}).hardware?.components ?? [];
    for (const comp of hwComponents) {
      if (['led', 'button', 'sensor', 'buzzer'].includes(comp.type ?? '')) {
        await this.maybeTeach('hardware_led', '');
        break;
      }
    }
    for (const comp of hwComponents) {
      if (['lora_send', 'lora_receive'].includes(comp.type ?? '')) {
        await this.maybeTeach('hardware_lora', '');
        break;
      }
    }

    await this.send({ type: 'deploy_complete', target: 'esp32' });
  }

  // -- Portal Deployment --

  private shouldDeployPortals(): boolean {
    const spec = this.session.spec ?? {};
    return Array.isArray(spec.portals) && spec.portals.length > 0;
  }

  private async initializePortals(): Promise<void> {
    const spec = this.session.spec ?? {};
    const portalSpecs = spec.portals ?? [];
    try {
      await this.portalService.initializePortals(portalSpecs);
    } catch (err: any) {
      console.warn('Portal initialization warning:', err.message);
    }
  }

  private async deployPortals(): Promise<void> {
    this.session.state = 'deploying';
    await this.send({ type: 'deploy_started', target: 'portals' });

    // Deploy serial portals through existing hardware pipeline
    if (this.portalService.hasSerialPortals()) {
      await this.send({
        type: 'deploy_progress',
        step: 'Compiling code for serial portal...',
        progress: 25,
      });
      const compileResult = await this.hardwareService.compile(this.nuggetDir);

      if (!compileResult.success) {
        await this.send({
          type: 'deploy_progress',
          step: `Compile failed: ${compileResult.errors.join(', ')}`,
          progress: 25,
        });
        await this.send({
          type: 'error',
          message: `Compilation failed: ${compileResult.errors.join(', ')}`,
          recoverable: true,
        });
        return;
      }

      await this.send({
        type: 'deploy_progress',
        step: 'Flashing to board...',
        progress: 60,
      });
      const flashResult = await this.hardwareService.flash(this.nuggetDir);

      if (!flashResult.success) {
        await this.send({
          type: 'deploy_progress',
          step: flashResult.message,
          progress: 60,
        });
        await this.send({
          type: 'error',
          message: flashResult.message,
          recoverable: true,
        });
        return;
      }

      await this.send({
        type: 'deploy_progress',
        step: 'Starting serial monitor...',
        progress: 90,
      });

      const board = await this.hardwareService.detectBoard();
      if (board) {
        this.serialHandle = await this.hardwareService.startSerialMonitor(
          board.port,
          async (line: string) => {
            await this.send({
              type: 'serial_data',
              line,
              timestamp: new Date().toISOString(),
            });
          },
        );
      }
    }

    await this.maybeTeach('portal_used', '');
    await this.send({ type: 'deploy_complete', target: 'portals' });
  }

  // -- Testing --

  private async runTests(): Promise<void> {
    this.session.state = 'testing';
    const results = await this.testRunner.runTests(this.nuggetDir);
    this.testResults = results;

    for (const test of results.tests ?? []) {
      await this.send({
        type: 'test_result',
        test_name: test.test_name,
        passed: test.passed,
        details: test.details,
      });
    }

    if (results.coverage_pct != null) {
      await this.send({
        type: 'coverage_update',
        percentage: results.coverage_pct,
        details: results.coverage_details ?? {},
      });
      await this.maybeTeach('coverage_update', `${results.coverage_pct}% coverage`);
    }

    if (results.total > 0) {
      const summary = `${results.passed}/${results.total} tests passing`;
      const eventType = results.failed === 0 ? 'test_result_pass' : 'test_result_fail';
      await this.maybeTeach(eventType, summary);
    }
  }

  // -- Completion --

  private async complete(): Promise<void> {
    this.session.state = 'done';
    for (const agent of this.agents) agent.status = 'done';

    const doneCount = this.tasks.filter((t) => t.status === 'done').length;
    const total = this.tasks.length;
    const failedCount = this.tasks.filter((t) => t.status === 'failed').length;

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

  // -- Teaching --

  private async maybeTeach(eventType: string, eventDetails = ''): Promise<void> {
    const moment = await this.teachingEngine.getMoment(
      eventType,
      eventDetails,
      this.nuggetType,
    );
    if (moment) {
      await this.send({ type: 'teaching_moment', ...moment });
    }
  }

  // -- Workspace --

  private async setupWorkspace(): Promise<void> {
    fs.mkdirSync(this.nuggetDir, { recursive: true });
    const dirs = [
      path.join(this.nuggetDir, '.elisa', 'comms'),
      path.join(this.nuggetDir, '.elisa', 'comms', 'reviews'),
      path.join(this.nuggetDir, '.elisa', 'context'),
      path.join(this.nuggetDir, '.elisa', 'status'),
      path.join(this.nuggetDir, 'src'),
      path.join(this.nuggetDir, 'tests'),
    ];
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
    }

    if (this.git) {
      try {
        const goal =
          (this.session.spec ?? {}).nugget?.goal ?? 'Elisa nugget';
        await this.git.initRepo(this.nuggetDir, goal);
      } catch {
        console.warn('Git not available, continuing without version control');
        this.git = null;
      }
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

  private makeOutputHandler(
    agentName: string,
  ): (taskId: string, content: string) => Promise<void> {
    return async (taskId: string, content: string) => {
      await this.send({
        type: 'agent_output',
        task_id: taskId,
        agent_name: agentName,
        content,
      });
    };
  }

  private makeQuestionHandler(
    taskId: string,
  ): (taskId: string, payload: Record<string, any>) => Promise<Record<string, any>> {
    return async (_taskId: string, payload: Record<string, any>) => {
      await this.send({
        type: 'user_question',
        event: 'user_question',
        task_id: taskId,
        payload,
      });
      return new Promise<Record<string, any>>((resolve) => {
        this.questionResolvers.set(taskId, resolve);
      });
    };
  }
}
