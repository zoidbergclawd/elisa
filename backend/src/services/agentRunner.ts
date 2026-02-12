/** Runs individual AI agents via the Claude Agent SDK.
 *
 * Uses the SDK's query() API to run agents programmatically. This eliminates
 * all subprocess/shell issues (Windows .cmd wrappers, ENOENT, etc.) and
 * provides native streaming, tool control, and permission management.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResult } from '../models/session.js';

export interface AgentRunnerParams {
  taskId: string;
  prompt: string;
  systemPrompt: string;
  onOutput: (taskId: string, content: string) => Promise<void>;
  onQuestion?: (
    taskId: string,
    payload: Record<string, any>,
  ) => Promise<Record<string, any>>;
  workingDir: string;
  timeout?: number;
  model?: string;
  maxTurns?: number;
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
}

export class AgentRunner {
  async execute(params: AgentRunnerParams): Promise<AgentResult> {
    const {
      taskId,
      prompt,
      systemPrompt,
      onOutput,
      workingDir,
      timeout = 300,
      model = process.env.CLAUDE_MODEL || 'claude-opus-4-6',
      maxTurns = 25,
      mcpServers,
    } = params;

    const mcpConfig = mcpServers?.length
      ? Object.fromEntries(mcpServers.map(s => [s.name, {
          command: s.command,
          ...(s.args ? { args: s.args } : {}),
          ...(s.env ? { env: s.env } : {}),
        }]))
      : undefined;

    try {
      return await withTimeout(
        this.runQuery(prompt, systemPrompt, workingDir, taskId, onOutput, model, maxTurns, mcpConfig),
        timeout * 1000,
      );
    } catch (err: any) {
      if (err.message === 'Timed out') {
        return {
          success: false,
          summary: `Agent timed out after ${timeout} seconds`,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      return {
        success: false,
        summary: String(err.message || err),
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  private async runQuery(
    prompt: string,
    systemPrompt: string,
    cwd: string,
    taskId: string,
    onOutput: (taskId: string, content: string) => Promise<void>,
    model: string,
    maxTurns: number,
    mcpConfig?: Record<string, any>,
  ): Promise<AgentResult> {
    const conversation = query({
      prompt,
      options: {
        cwd,
        model,
        maxTurns,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt,
        ...(mcpConfig ? { mcpServers: mcpConfig } : {}),
      },
    });

    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let finalResult = '';
    let success = true;
    const accumulatedText: string[] = [];

    for await (const message of conversation) {
      if (message.type === 'assistant') {
        for (const block of (message as any).message?.content ?? []) {
          if (block.type === 'text') {
            accumulatedText.push(block.text);
            onOutput(taskId, block.text).catch(() => {});
          }
        }
      }

      if (message.type === 'result') {
        const result = message as any;
        costUsd = result.total_cost_usd ?? 0;
        inputTokens = result.usage?.input_tokens ?? 0;
        outputTokens = result.usage?.output_tokens ?? 0;

        if (result.subtype === 'success') {
          finalResult = result.result ?? '';
        } else {
          success = false;
          const errors: string[] = result.errors ?? [];
          finalResult = errors.join('; ') || 'Unknown error';
        }
      }
    }

    const summary = finalResult || accumulatedText.slice(-3).join('\n') || 'No output';
    return { success, summary, costUsd, inputTokens, outputTokens };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
