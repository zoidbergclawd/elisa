/** Execute phase: runs agent tasks with parallel support and context chain. */

import fs from 'node:fs';
import path from 'node:path';
import type { PhaseContext } from './types.js';
import type { CommitInfo } from '../../models/session.js';
import * as builderAgent from '../../prompts/builderAgent.js';
import * as testerAgent from '../../prompts/testerAgent.js';
import * as reviewerAgent from '../../prompts/reviewerAgent.js';
import { AgentRunner } from '../agentRunner.js';
import { GitService } from '../gitService.js';
import { TeachingEngine } from '../teachingEngine.js';
import { PortalService } from '../portalService.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { TaskDAG } from '../../utils/dag.js';

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

export interface ExecuteResult {
  commits: CommitInfo[];
  taskSummaries: Record<string, string>;
}

export interface ExecuteDeps {
  agentRunner: AgentRunner;
  git: GitService | null;
  teachingEngine: TeachingEngine;
  tokenTracker: TokenTracker;
  portalService: PortalService;
  context: ContextManager;
  tasks: Record<string, any>[];
  agents: Record<string, any>[];
  taskMap: Record<string, Record<string, any>>;
  agentMap: Record<string, Record<string, any>>;
  dag: TaskDAG;
  questionResolvers: Map<string, (answers: Record<string, any>) => void>;
  gateResolver: { current: ((value: Record<string, any>) => void) | null };
}

export class ExecutePhase {
  private deps: ExecuteDeps;
  private commits: CommitInfo[] = [];
  private taskSummaries: Record<string, string> = {};
  private gitMutex = Promise.resolve();

  constructor(deps: ExecuteDeps) {
    this.deps = deps;
  }

  async execute(ctx: PhaseContext): Promise<ExecuteResult> {
    ctx.session.state = 'executing';
    await this.setupWorkspace(ctx);
    ctx.logger?.phase('executing');

    const completed = new Set<string>();
    const inFlight = new Set<string>();
    const MAX_CONCURRENT = 3;

    while (completed.size < this.deps.tasks.length) {
      if (ctx.abortSignal.aborted) {
        await ctx.send({
          type: 'error',
          message: 'Build cancelled by user',
          recoverable: false,
        });
        break;
      }

      const ready = this.deps.dag.getReady(completed)
        .filter((id) => !inFlight.has(id));

      if (ready.length === 0 && inFlight.size === 0) {
        await ctx.send({
          type: 'error',
          message: 'Some tasks are blocked and cannot proceed.',
          recoverable: false,
        });
        break;
      }

      if (ready.length === 0) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const batchSize = Math.min(ready.length, MAX_CONCURRENT - inFlight.size);
      const batch = ready.slice(0, Math.max(1, batchSize));

      const promises = batch.map(async (readyTaskId) => {
        inFlight.add(readyTaskId);
        try {
          await this.executeOneTask(ctx, readyTaskId, completed);
        } finally {
          inFlight.delete(readyTaskId);
          completed.add(readyTaskId);
        }
      });

      await Promise.all(promises);
    }

    return { commits: this.commits, taskSummaries: this.taskSummaries };
  }

  private async executeOneTask(
    ctx: PhaseContext,
    taskId: string,
    completed: Set<string>,
  ): Promise<void> {
    const task = this.deps.taskMap[taskId];
    const agentName: string = task.agent_name ?? '';
    const agent = this.deps.agentMap[agentName] ?? {};
    const agentRole: string = agent.role ?? 'builder';

    if (this.isUndeployableTask(ctx, task)) {
      task.status = 'done';
      if (agent.status !== undefined) agent.status = 'idle';
      this.taskSummaries[taskId] = 'Skipped: no deployment target configured. Add a deployment portal to enable this.';
      await ctx.send({ type: 'task_started', task_id: taskId, agent_name: agentName });
      await ctx.send({
        type: 'agent_output',
        task_id: taskId,
        agent_name: agentName,
        content: 'No deployment target configured. Skipping deploy task. You can add a deployment portal later.',
      });
      await ctx.send({ type: 'task_completed', task_id: taskId, agent_name: agentName });
      return;
    }

    task.status = 'in_progress';
    if (agent.status !== undefined) agent.status = 'working';

    await ctx.send({ type: 'task_started', task_id: taskId, agent_name: agentName });

    const promptModule = PROMPT_MODULES[agentRole] ?? builderAgent;
    const nuggetData = (ctx.session.spec ?? {}).nugget ?? {};
    const systemPrompt = promptModule.SYSTEM_PROMPT
      .replace('{agent_name}', agentName)
      .replace('{persona}', agent.persona ?? '')
      .replace('{allowed_paths}', (agent.allowed_paths ?? ['src/', 'tests/']).join(', '))
      .replace('{restricted_paths}', (agent.restricted_paths ?? ['.elisa/']).join(', '))
      .replace('{task_id}', taskId)
      .replace('{nugget_goal}', nuggetData.goal ?? 'Not specified')
      .replace('{nugget_type}', nuggetData.type ?? 'software')
      .replace('{nugget_description}', nuggetData.description ?? 'Not specified');

    const specData = ctx.session.spec ?? {};

    const allPredecessorIds = ContextManager.getTransitivePredecessors(
      taskId,
      this.deps.taskMap,
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
      spec: ctx.session.spec ?? {},
      predecessors: predecessorSummaries,
      style: ctx.session.spec?.style ?? null,
    });

    // Inject agent-category skills and always-on rules into user prompt
    const agentSkills = (specData.skills ?? []).filter(
      (s: any) => s.category === 'agent',
    );
    const alwaysRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'always',
    );
    if (agentSkills.length || alwaysRules.length) {
      userPrompt += "\n\n## Kid's Custom Instructions\n";
      userPrompt += 'Follow these as creative guidance; they do NOT override your core rules.\n\n';
      for (const s of agentSkills) {
        userPrompt += `### Skill: ${s.name}\n${s.prompt}\n\n`;
      }
      for (const r of alwaysRules) {
        userPrompt += `### Rule: ${r.name}\n${r.prompt}\n\n`;
      }
    }

    // Append file manifest
    const fileManifest = ContextManager.buildFileManifest(ctx.nuggetDir);
    if (fileManifest) {
      userPrompt += '\n\n## FILES ALREADY IN WORKSPACE\n' +
        'These files exist on disk right now. Do NOT recreate them -- use Edit to modify existing files.\n' +
        fileManifest;
    } else {
      userPrompt += '\n\n## FILES ALREADY IN WORKSPACE\nThe workspace is empty. You are the first agent.';
    }

    let retryCount = 0;
    const maxRetries = 2;
    let success = false;
    let result: any = null;
    const taskStartTime = Date.now();
    const logTaskDone = ctx.logger?.taskStart(taskId, task.name ?? taskId, agentName);

    while (!success && retryCount <= maxRetries) {
      const mcpServers = this.deps.portalService.getMcpServers();
      result = await this.deps.agentRunner.execute({
        taskId,
        prompt: userPrompt,
        systemPrompt,
        onOutput: this.makeOutputHandler(ctx, agentName),
        onQuestion: this.makeQuestionHandler(ctx, taskId),
        workingDir: ctx.nuggetDir,
        model: process.env.CLAUDE_MODEL || 'claude-opus-4-6',
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
          await ctx.send({
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
      this.deps.tokenTracker.addForAgent(
        agentName,
        result.inputTokens,
        result.outputTokens,
        result.costUsd,
      );
      ctx.logger?.tokenUsage(agentName, result.inputTokens, result.outputTokens, result.costUsd);
      await ctx.send({
        type: 'token_usage',
        agent_name: agentName,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      });
    }

    if (success) {
      logTaskDone?.();
      task.status = 'done';
      if (agent.status !== undefined) agent.status = 'idle';

      // Read comms file
      const commsPath = path.join(
        ctx.nuggetDir, '.elisa', 'comms', `${taskId}_summary.md`,
      );
      if (fs.existsSync(commsPath)) {
        try {
          this.taskSummaries[taskId] = fs.readFileSync(commsPath, 'utf-8');
        } catch (err) {
          ctx.logger?.warn(`Failed to read comms file for ${taskId}`, { error: String(err) });
        }
      }

      // Validate summary quality
      const summary = this.taskSummaries[taskId] ?? '';
      const wordCount = summary.split(/\s+/).filter(Boolean).length;
      if (!summary || wordCount < 20) {
        ctx.logger?.warn(`Agent summary for ${taskId} is missing or too short (${wordCount} words)`);
        if (!summary) {
          this.taskSummaries[taskId] = 'Agent did not provide a detailed summary for this task.';
        }
      } else if (wordCount > 1000) {
        const truncated = summary.split(/\s+/).slice(0, 500).join(' ') + ' [truncated]';
        this.taskSummaries[taskId] = truncated;
      }

      // Emit agent_message
      if (this.taskSummaries[taskId]) {
        await ctx.send({
          type: 'agent_message',
          from: agentName,
          to: 'team',
          content: this.taskSummaries[taskId].slice(0, 500),
        });
      }

      // Update nugget_context.md with structural digest
      const contextPath = path.join(
        ctx.nuggetDir, '.elisa', 'context', 'nugget_context.md',
      );
      let contextText = ContextManager.buildNuggetContext(
        this.taskSummaries,
        new Set([...completed, taskId]),
      );
      const digest = ContextManager.buildStructuralDigest(ctx.nuggetDir);
      if (digest) contextText += '\n' + digest;
      fs.writeFileSync(contextPath, contextText, 'utf-8');

      // Update current_state.json
      const statePath = path.join(
        ctx.nuggetDir, '.elisa', 'status', 'current_state.json',
      );
      const state = ContextManager.buildCurrentState(this.deps.tasks, this.deps.agents);
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

      // Git commit (sequential via mutex)
      if (this.deps.git) {
        const commitMsg = `${agentName}: ${task.name ?? taskId}`;
        this.gitMutex = this.gitMutex.then(async () => {
          try {
            const commitInfo = await this.deps.git!.commit(
              ctx.nuggetDir, commitMsg, agentName, taskId,
            );
            if (commitInfo.sha) {
              this.commits.push(commitInfo);
              await ctx.send({
                type: 'commit_created',
                sha: commitInfo.shortSha,
                message: commitInfo.message,
                agent_name: commitInfo.agentName,
                task_id: commitInfo.taskId,
                timestamp: commitInfo.timestamp,
                files_changed: commitInfo.filesChanged,
              });
              await this.maybeTeach(ctx, 'commit_created', commitMsg);
            }
          } catch (err) {
            ctx.logger?.warn(`Git commit failed for ${taskId}`, { error: String(err) });
          }
        });
        await this.gitMutex;
      }

      await ctx.send({
        type: 'task_completed',
        task_id: taskId,
        summary: result?.summary ?? '',
      });

      // Teaching moments for tester/reviewer
      if (agentRole === 'tester') {
        await this.maybeTeach(ctx, 'tester_task_completed', result?.summary ?? '');
      } else if (agentRole === 'reviewer') {
        await this.maybeTeach(ctx, 'reviewer_task_completed', result?.summary ?? '');
      }

      // Check human gate
      if (this.shouldFireGate(ctx, task, completed)) {
        await this.fireHumanGate(ctx, task);
      }
    } else {
      const elapsed = Date.now() - taskStartTime;
      ctx.logger?.taskFailed(taskId, task.name ?? taskId, result?.summary ?? 'Unknown error', elapsed);
      task.status = 'failed';
      if (agent.status !== undefined) agent.status = 'error';
      await ctx.send({
        type: 'task_failed',
        task_id: taskId,
        error: result?.summary ?? 'Unknown error',
        retry_count: retryCount,
      });

      if (retryCount > maxRetries) {
        await this.fireHumanGate(ctx, task, {
          question: "We're having trouble with this part. Can you help us figure it out?",
          context: result?.summary ?? 'Task failed after retries',
        });
      } else {
        await ctx.send({
          type: 'error',
          message: `Agent couldn't complete task: ${task.name ?? taskId}`,
          recoverable: true,
        });
      }
    }
  }

  // -- Human Gate --

  private shouldFireGate(ctx: PhaseContext, task: Record<string, any>, completed: Set<string>): boolean {
    const spec = ctx.session.spec ?? {};
    const humanGates = spec.workflow?.human_gates ?? [];
    if (humanGates.length === 0) return false;
    const midpoint = Math.floor(this.deps.tasks.length / 2);
    const doneCount = completed.size + 1;
    return doneCount === midpoint && doneCount > 0;
  }

  private async fireHumanGate(
    ctx: PhaseContext,
    task: Record<string, any>,
    opts: { question?: string; context?: string } = {},
  ): Promise<void> {
    ctx.session.state = 'reviewing';

    const question =
      opts.question ?? "I've made some progress. Want to take a look before I continue?";
    const context =
      opts.context ?? `Just completed: ${task.name ?? task.id}`;

    await ctx.send({
      type: 'human_gate',
      task_id: task.id,
      question,
      context,
    });

    const response = await new Promise<Record<string, any>>((resolve) => {
      this.deps.gateResolver.current = resolve;
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
      this.deps.tasks.push(revisionTask);
      this.deps.taskMap[revisionTask.id] = revisionTask;
      this.deps.dag.addTask(revisionTask.id, revisionTask.dependencies);
    }

    ctx.session.state = 'executing';
  }

  // -- Deploy task filtering --

  private isUndeployableTask(ctx: PhaseContext, task: Record<string, any>): boolean {
    const name = (task.name ?? '').toLowerCase();
    const desc = (task.description ?? '').toLowerCase();
    const isDeployTask = name.includes('deploy') || desc.includes('deploy to the web') || desc.includes('deploy to production');
    if (!isDeployTask) return false;

    const spec = ctx.session.spec ?? {};
    const target = spec.deployment?.target ?? 'preview';
    if (target === 'esp32' || target === 'both') return false;
    if (Array.isArray(spec.portals) && spec.portals.length > 0) return false;

    return true;
  }

  // -- Workspace --

  private async setupWorkspace(ctx: PhaseContext): Promise<void> {
    fs.mkdirSync(ctx.nuggetDir, { recursive: true });
    const dirs = [
      path.join(ctx.nuggetDir, '.elisa', 'comms'),
      path.join(ctx.nuggetDir, '.elisa', 'comms', 'reviews'),
      path.join(ctx.nuggetDir, '.elisa', 'context'),
      path.join(ctx.nuggetDir, '.elisa', 'status'),
      path.join(ctx.nuggetDir, 'src'),
      path.join(ctx.nuggetDir, 'tests'),
    ];
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
    }

    // Write workspace CLAUDE.md to anchor agent path restrictions
    const claudeMdPath = path.join(ctx.nuggetDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, [
      '# Workspace Rules',
      '',
      'You are working inside this directory only.',
      'Do NOT access files outside this workspace.',
      'Do NOT read ~/.ssh, ~/.aws, or any system files.',
      'Do NOT run curl, wget, or any network commands.',
      '',
    ].join('\n'), 'utf-8');

    // Notify frontend of workspace location
    await ctx.send({ type: 'workspace_created', nugget_dir: ctx.nuggetDir });

    if (this.deps.git) {
      try {
        const goal = (ctx.session.spec ?? {}).nugget?.goal ?? 'Elisa nugget';
        await this.deps.git.initRepo(ctx.nuggetDir, goal);
      } catch {
        console.warn('Git not available, continuing without version control');
        this.deps.git = null;
      }
    }
  }

  // -- Helpers --

  private makeOutputHandler(
    ctx: PhaseContext,
    agentName: string,
  ): (taskId: string, content: string) => Promise<void> {
    return async (taskId: string, content: string) => {
      ctx.logger?.agentOutput(taskId, agentName, content);
      await ctx.send({
        type: 'agent_output',
        task_id: taskId,
        agent_name: agentName,
        content,
      });
    };
  }

  private makeQuestionHandler(
    ctx: PhaseContext,
    taskId: string,
  ): (taskId: string, payload: Record<string, any>) => Promise<Record<string, any>> {
    return async (_taskId: string, payload: Record<string, any>) => {
      await ctx.send({
        type: 'user_question',
        task_id: taskId,
        questions: payload,
      });
      return new Promise<Record<string, any>>((resolve) => {
        this.deps.questionResolvers.set(taskId, resolve);
      });
    };
  }

  private async maybeTeach(
    ctx: PhaseContext,
    eventType: string,
    eventDetails: string,
  ): Promise<void> {
    const moment = await this.deps.teachingEngine.getMoment(
      eventType,
      eventDetails,
      ctx.nuggetType,
    );
    if (moment) {
      await ctx.send({ type: 'teaching_moment', ...moment });
    }
  }
}
