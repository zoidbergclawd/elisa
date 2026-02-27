/** TaskExecutor: runs a single agent task through the full execution pipeline.
 *
 * Extracted from executePhase.ts to isolate single-task execution from DAG
 * orchestration. This module owns:
 *   - The retry loop (attempt tracking, max retries = 2)
 *   - Agent execution call via AgentRunner
 *   - Post-execution: comms file reading, summary validation, git commit, context chain
 *   - Token budget pre-check per task
 *   - Narrator / teaching moment calls
 *   - Human gate logic (shouldFireGate + fireHumanGate)
 *   - makeQuestionHandler / makeOutputHandler factory methods
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PhaseContext } from './types.js';
import { maybeTeach } from './types.js';
import type { CommitInfo, Task, Agent, AgentResult } from '../../models/session.js';
import type { AgentRunner } from '../agentRunner.js';
import type { GitService } from '../gitService.js';
import type { TeachingEngine } from '../teachingEngine.js';
import type { PortalService } from '../portalService.js';
import type { NarratorService } from '../narratorService.js';
import type { PermissionPolicy } from '../permissionPolicy.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import type { FeedbackLoopTracker } from '../feedbackLoopTracker.js';
import { ContextManager } from '../../utils/contextManager.js';
import type { TokenTracker } from '../../utils/tokenTracker.js';
import { TaskDAG } from '../../utils/dag.js';
import { DEFAULT_MODEL, MAX_TURNS_DEFAULT, MAX_TURNS_RETRY_INCREMENT } from '../../utils/constants.js';
import { PromptBuilder } from './promptBuilder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskExecutorDeps {
  agentRunner: AgentRunner;
  git: GitService | null;
  teachingEngine: TeachingEngine;
  tokenTracker: TokenTracker;
  context: ContextManager;
  promptBuilder: PromptBuilder;
  portalService: PortalService;
  narratorService?: NarratorService;
  permissionPolicy?: PermissionPolicy;
  feedbackLoopTracker?: FeedbackLoopTracker;
  deviceRegistry?: DeviceRegistry;
}

export interface TaskExecutionResult {
  summary: string;
  commit?: CommitInfo;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TaskExecutionOptions {
  taskMap: Record<string, Task>;
  taskSummaries: Record<string, string>;
  tasks: Task[];
  agents: Agent[];
  nuggetDir: string;
  gitMutex: (fn: () => Promise<void>) => Promise<void>;
  questionResolvers: Map<string, (answers: Record<string, any>) => void>;
  gateResolver: { current: ((value: Record<string, any>) => void) | null };
  dag: TaskDAG;
  completed: Set<string>;
  commits: CommitInfo[];
}

// ---------------------------------------------------------------------------
// TaskExecutor
// ---------------------------------------------------------------------------

export class TaskExecutor {
  private deps: TaskExecutorDeps;

  constructor(deps: TaskExecutorDeps) {
    this.deps = deps;
  }

  /**
   * Execute a single task through the full pipeline:
   * prompt build -> retry loop -> agent execution -> post-processing.
   *
   * Returns true on success, false on failure.
   */
  async executeTask(
    task: Task,
    agent: Agent,
    ctx: PhaseContext,
    options: TaskExecutionOptions,
  ): Promise<boolean> {
    const taskId = task.id;
    const agentName: string = task.agent_name ?? '';
    const agentRole: string = agent.role ?? 'builder';

    task.status = 'in_progress';
    if (agent) agent.status = 'working';

    await ctx.send({ type: 'task_started', task_id: taskId, agent_name: agentName });

    if (this.deps.narratorService) {
      const nuggetGoal = (ctx.session.spec ?? {}).nugget?.goal ?? '';
      const msg = await this.deps.narratorService.translate('task_started', agentName, task.name ?? taskId, nuggetGoal);
      if (msg) {
        this.deps.narratorService.recordEmission(taskId);
        await ctx.send({ type: 'narrator_message', from: 'Elisa', text: msg.text, mood: msg.mood, related_task_id: taskId });
      }
    }

    await ctx.send({ type: 'minion_state_change', agent_name: agentName, old_status: 'idle', new_status: 'working' });

    const specData = ctx.session.spec ?? {};

    // Delegate prompt construction to PromptBuilder
    const { systemPrompt, userPrompt: builtUserPrompt } = this.deps.promptBuilder.buildTaskPrompt({
      task,
      agent,
      spec: specData,
      taskSummaries: options.taskSummaries,
      taskMap: options.taskMap,
      nuggetDir: options.nuggetDir,
      deviceRegistry: this.deps.deviceRegistry,
    });

    let userPrompt = builtUserPrompt;

    let retryCount = 0;
    const maxRetries = 2;
    let success = false;
    let result: AgentResult | null = null;
    const taskStartTime = Date.now();
    const logTaskDone = ctx.logger?.taskStart(taskId, task.name ?? taskId, agentName);

    // Pre-build retry rules suffix once to avoid appending duplicates on each retry
    let retryRulesSuffix = '';
    const onFailRules = (specData.rules ?? []).filter(
      (r: any) => r.trigger === 'on_test_fail',
    );
    if (onFailRules.length) {
      retryRulesSuffix = "\n\n## Retry Rules (kid's rules)\n";
      for (const r of onFailRules) {
        retryRulesSuffix += `<kid_rule name="${r.name}">\n${r.prompt}\n</kid_rule>\n`;
      }
    }

    // Check token budget before starting agent invocation
    if (this.deps.tokenTracker.budgetExceeded) {
      const total = this.deps.tokenTracker.total;
      const max = this.deps.tokenTracker.maxBudget;
      task.status = 'failed';
      if (agent) agent.status = 'idle';
      const msg = `Token budget exceeded (${total} / ${max}). Skipping remaining tasks.`;
      options.taskSummaries[taskId] = msg;
      await ctx.send({
        type: 'agent_output',
        task_id: taskId,
        agent_name: agentName,
        content: msg,
      });
      await ctx.send({ type: 'task_failed', task_id: taskId, error: msg, retry_count: 0 });
      return false;
    }

    while (!success && retryCount <= maxRetries) {
      // Notify feedback loop tracker of this attempt
      if (this.deps.feedbackLoopTracker) {
        const failReason = retryCount > 0 ? (result?.summary ?? 'Previous attempt failed') : undefined;
        await this.deps.feedbackLoopTracker.startAttempt(taskId, task.name ?? taskId, retryCount, failReason);
      }

      const mcpServers = this.deps.portalService.getMcpServers();
      let prompt = userPrompt;
      if (retryCount > 0) {
        // Mark as "fixing" when entering a retry
        if (this.deps.feedbackLoopTracker) {
          await this.deps.feedbackLoopTracker.markFixing(taskId);
        }

        const retryContext = [
          `## Retry Attempt ${retryCount}`,
          'A previous attempt at this task did not complete successfully.',
          'The workspace already contains partial work from that attempt.',
          'Skip orientation — do NOT re-read files you can see in the manifest and digest.',
          'Go straight to implementation.',
        ].join('\n');
        prompt = retryContext + '\n\n' + prompt;
      }
      if (retryCount > 0 && retryRulesSuffix) {
        prompt += retryRulesSuffix;
      }
      const maxTurns = MAX_TURNS_DEFAULT + (retryCount * MAX_TURNS_RETRY_INCREMENT);
      const resolvedSystemPrompt = systemPrompt.replaceAll('{max_turns}', String(maxTurns));

      // Mark as "retesting" just before agent execution on retries
      if (retryCount > 0 && this.deps.feedbackLoopTracker) {
        await this.deps.feedbackLoopTracker.markRetesting(taskId);
      }

      result = await this.deps.agentRunner.execute({
        taskId,
        prompt,
        systemPrompt: resolvedSystemPrompt,
        onOutput: this.makeOutputHandler(ctx, agentName),
        onQuestion: this.makeQuestionHandler(ctx, taskId, options.questionResolvers),
        workingDir: options.nuggetDir,
        model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
        maxTurns,
        allowedTools: [
          'Read', 'Write', 'Edit', 'MultiEdit',
          'Glob', 'Grep', 'LS',
          'Bash',
          'NotebookEdit', 'NotebookRead',
        ],
        abortSignal: ctx.abortSignal,
        ...(mcpServers.length > 0 ? { mcpServers } : {}),
      });

      if (result.success) {
        success = true;
        options.taskSummaries[taskId] = result.summary;

        // Record successful attempt in feedback loop tracker
        if (this.deps.feedbackLoopTracker) {
          await this.deps.feedbackLoopTracker.recordAttemptResult(taskId, true);
        }
      } else {
        // Record failed attempt in feedback loop tracker
        if (this.deps.feedbackLoopTracker) {
          await this.deps.feedbackLoopTracker.recordAttemptResult(taskId, false);
        }

        retryCount++;
        if (retryCount <= maxRetries) {
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
        cost_usd: result.costUsd ?? 0,
      });
      if (this.deps.tokenTracker.checkWarning()) {
        await ctx.send({
          type: 'budget_warning',
          total_tokens: this.deps.tokenTracker.total,
          max_budget: this.deps.tokenTracker.maxBudget,
          cost_usd: this.deps.tokenTracker.costUsd,
        });
      }
    }

    if (success) {
      return this.handleSuccess(task, agent, agentRole, taskId, agentName, result, ctx, options, logTaskDone);
    } else {
      return this.handleFailure(task, agent, taskId, agentName, result, retryCount, maxRetries, taskStartTime, ctx, options);
    }
  }

  // -- Success path --

  private async handleSuccess(
    task: Task,
    agent: Agent,
    agentRole: string,
    taskId: string,
    agentName: string,
    result: AgentResult | null,
    ctx: PhaseContext,
    options: TaskExecutionOptions,
    logTaskDone?: (() => void) | undefined,
  ): Promise<boolean> {
    logTaskDone?.();
    task.status = 'done';
    if (agent) agent.status = 'idle';

    // Read comms file
    const commsPath = path.join(
      options.nuggetDir, '.elisa', 'comms', `${taskId}_summary.md`,
    );
    if (fs.existsSync(commsPath)) {
      try {
        options.taskSummaries[taskId] = fs.readFileSync(commsPath, 'utf-8');
      } catch (err) {
        ctx.logger?.warn(`Failed to read comms file for ${taskId}`, { error: String(err) });
      }
    }

    // Validate summary quality
    const summary = options.taskSummaries[taskId] ?? '';
    const wordCount = summary.split(/\s+/).filter(Boolean).length;
    if (!summary || wordCount < 20) {
      ctx.logger?.warn(`Agent summary for ${taskId} is missing or too short (${wordCount} words)`);
      if (!summary) {
        options.taskSummaries[taskId] = 'Agent did not provide a detailed summary for this task.';
      }
    } else if (wordCount > 1000) {
      const truncated = summary.split(/\s+/).slice(0, 500).join(' ') + ' [truncated]';
      options.taskSummaries[taskId] = truncated;
    }

    // Emit agent_message
    if (options.taskSummaries[taskId]) {
      await ctx.send({
        type: 'agent_message',
        from: agentName,
        to: 'team',
        content: options.taskSummaries[taskId].slice(0, 500),
      });
    }

    // Update nugget_context.md with structural digest
    const contextPath = path.join(
      options.nuggetDir, '.elisa', 'context', 'nugget_context.md',
    );
    let contextText = ContextManager.buildNuggetContext(
      options.taskSummaries,
      new Set([...options.completed, taskId]),
    );
    const digest = ContextManager.buildStructuralDigest(options.nuggetDir);
    if (digest) contextText += '\n' + digest;
    fs.writeFileSync(contextPath, contextText, 'utf-8');

    // Emit context_flow event to show data flowing from this task to its dependents
    const dependentTaskIds = options.tasks
      .filter(t => t.dependencies.includes(taskId))
      .map(t => t.id);
    if (dependentTaskIds.length > 0) {
      const summaryPreview = (options.taskSummaries[taskId] ?? '').slice(0, 120);
      await ctx.send({
        type: 'context_flow',
        from_task_id: taskId,
        to_task_ids: dependentTaskIds,
        summary_preview: summaryPreview,
      });
    }

    // Update current_state.json
    const statePath = path.join(
      options.nuggetDir, '.elisa', 'status', 'current_state.json',
    );
    const state = ContextManager.buildCurrentState(options.tasks, options.agents);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

    // Git commit (sequential via mutex)
    if (this.deps.git) {
      const commitMsg = `${agentName}: ${task.name ?? taskId}`;
      await options.gitMutex(async () => {
        try {
          const commitInfo = await this.deps.git!.commit(
            options.nuggetDir, commitMsg, agentName, taskId,
          );
          if (commitInfo.sha) {
            options.commits.push(commitInfo);
            await ctx.send({
              type: 'commit_created',
              sha: commitInfo.shortSha,
              message: commitInfo.message,
              agent_name: commitInfo.agentName,
              task_id: commitInfo.taskId,
              timestamp: commitInfo.timestamp,
              files_changed: commitInfo.filesChanged,
            });
            await maybeTeach(this.deps.teachingEngine, ctx, 'commit_created', commitMsg);
          }
        } catch (err) {
          ctx.logger?.warn(`Git commit failed for ${taskId}`, { error: String(err) });
        }
      });
    }

    await ctx.send({
      type: 'task_completed',
      task_id: taskId,
      summary: result?.summary ?? '',
    });

    if (this.deps.narratorService) {
      this.deps.narratorService.flushTask(taskId);
      const nuggetGoal = (ctx.session.spec ?? {}).nugget?.goal ?? '';
      const msg = await this.deps.narratorService.translate('task_completed', agentName, result?.summary ?? '', nuggetGoal);
      if (msg) {
        this.deps.narratorService.recordEmission(taskId);
        await ctx.send({ type: 'narrator_message', from: 'Elisa', text: msg.text, mood: msg.mood, related_task_id: taskId });
      }
    }

    // Teaching moments for tester/reviewer
    if (agentRole === 'tester') {
      await maybeTeach(this.deps.teachingEngine, ctx, 'tester_task_completed', result?.summary ?? '');
    } else if (agentRole === 'reviewer') {
      await maybeTeach(this.deps.teachingEngine, ctx, 'reviewer_task_completed', result?.summary ?? '');
    }

    // Check human gate
    if (this.shouldFireGate(ctx, task, options)) {
      await this.fireHumanGate(ctx, task, options);
    }
    options.questionResolvers.delete(taskId);
    return true;
  }

  // -- Failure path --

  private async handleFailure(
    task: Task,
    agent: Agent,
    taskId: string,
    agentName: string,
    result: AgentResult | null,
    retryCount: number,
    maxRetries: number,
    taskStartTime: number,
    ctx: PhaseContext,
    options: TaskExecutionOptions,
  ): Promise<boolean> {
    const elapsed = Date.now() - taskStartTime;
    ctx.logger?.taskFailed(taskId, task.name ?? taskId, result?.summary ?? 'Unknown error', elapsed);
    task.status = 'failed';
    if (agent) agent.status = 'error';
    await ctx.send({
      type: 'task_failed',
      task_id: taskId,
      error: result?.summary ?? 'Unknown error',
      retry_count: retryCount,
    });

    if (this.deps.narratorService) {
      this.deps.narratorService.flushTask(taskId);
      const nuggetGoal = (ctx.session.spec ?? {}).nugget?.goal ?? '';
      const msg = await this.deps.narratorService.translate('task_failed', agentName, result?.summary ?? 'Unknown error', nuggetGoal);
      if (msg) {
        this.deps.narratorService.recordEmission(taskId);
        await ctx.send({ type: 'narrator_message', from: 'Elisa', text: msg.text, mood: msg.mood, related_task_id: taskId });
      }
    }

    if (retryCount > maxRetries) {
      await this.fireHumanGate(ctx, task, options, {
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
    options.questionResolvers.delete(taskId);
    return false;
  }

  // -- Human Gate --

  shouldFireGate(ctx: PhaseContext, task: Task, options: TaskExecutionOptions): boolean {
    const spec = ctx.session.spec ?? {};
    const humanGates = spec.workflow?.human_gates ?? [];
    if (humanGates.length === 0) return false;
    const midpoint = Math.floor(options.tasks.length / 2);
    const doneCount = options.completed.size + 1;
    return doneCount === midpoint && doneCount > 0;
  }

  async fireHumanGate(
    ctx: PhaseContext,
    task: Task,
    options: TaskExecutionOptions,
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

    const response = await Promise.race([
      new Promise<Record<string, any>>((resolve) => {
        options.gateResolver.current = resolve;
      }),
      new Promise<Record<string, any>>((_, reject) => {
        if (ctx.abortSignal.aborted) {
          reject(new Error('Build cancelled'));
          return;
        }
        const onAbort = () => reject(new Error('Build cancelled'));
        ctx.abortSignal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);

    if (!response.approved) {
      const feedback = response.feedback ?? '';
      const revisionTask: Task = {
        id: `task-revision-${task.id}`,
        name: `Revise: ${task.name ?? task.id}`,
        description: `Revise based on feedback: ${feedback}`,
        acceptance_criteria: [`Address feedback: ${feedback}`],
        dependencies: [task.id],
        agent_name: task.agent_name ?? '',
        status: 'pending',
      };
      options.tasks.push(revisionTask);
      options.taskMap[revisionTask.id] = revisionTask;
      options.dag.addTask(revisionTask.id, revisionTask.dependencies);
    }

    ctx.session.state = 'executing';
  }

  // -- Helpers --

  makeOutputHandler(
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
      if (this.deps.narratorService) {
        const nuggetGoal = (ctx.session.spec ?? {}).nugget?.goal ?? '';
        this.deps.narratorService.accumulateOutput(taskId, content, agentName, nuggetGoal, async (msg) => {
          await ctx.send({ type: 'narrator_message', from: 'Elisa', text: msg.text, mood: msg.mood, related_task_id: taskId });
        });
      }
    };
  }

  makeQuestionHandler(
    ctx: PhaseContext,
    taskId: string,
    questionResolvers: Map<string, (answers: Record<string, any>) => void>,
  ): (taskId: string, payload: Record<string, any>) => Promise<Record<string, any>> {
    return async (_taskId: string, payload: Record<string, any>) => {
      if (this.deps.permissionPolicy && payload) {
        // Try to detect permission-type requests
        const toolName = payload.tool_name ?? payload.type ?? '';
        const toolInput = payload.tool_input ?? payload.input ?? '';

        let permType = '';
        let permDetail = '';
        if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
          permType = 'file_write';
          permDetail = typeof toolInput === 'object' ? (toolInput.file_path ?? '') : String(toolInput);
        } else if (toolName === 'Bash') {
          permType = 'command';
          permDetail = typeof toolInput === 'object' ? (toolInput.command ?? '') : String(toolInput);
        }

        if (permType) {
          const decision = this.deps.permissionPolicy.evaluate(permType, permDetail, taskId, ctx.nuggetDir);
          if (decision.decision === 'approved') {
            await ctx.send({
              type: 'permission_auto_resolved',
              task_id: taskId,
              permission_type: decision.permission_type,
              decision: 'approved',
              reason: decision.reason,
            });
            return { approved: true };
          }
          if (decision.decision === 'denied') {
            await ctx.send({
              type: 'permission_auto_resolved',
              task_id: taskId,
              permission_type: decision.permission_type,
              decision: 'denied',
              reason: decision.reason,
            });
            return { denied: true, reason: decision.reason };
          }
          // 'escalate' falls through to normal question flow
        }
      }

      await ctx.send({
        type: 'user_question',
        task_id: taskId,
        questions: payload,
      });
      return Promise.race([
        new Promise<Record<string, any>>((resolve) => {
          questionResolvers.set(taskId, resolve);
        }),
        new Promise<Record<string, any>>((_, reject) => {
          if (ctx.abortSignal.aborted) {
            reject(new Error('Build cancelled'));
            return;
          }
          const onAbort = () => reject(new Error('Build cancelled'));
          ctx.abortSignal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    };
  }
}
