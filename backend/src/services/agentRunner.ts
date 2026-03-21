/** Runs individual AI agents via the Claude Agent SDK.
 *
 * Uses the SDK's query() API to run agents programmatically. This eliminates
 * all subprocess/shell issues (Windows .cmd wrappers, ENOENT, etc.) and
 * provides native streaming, tool control, and permission management.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResult } from '../models/session.js';
import { withTimeout, TimeoutError } from '../utils/withTimeout.js';
import { MAX_TURNS_DEFAULT } from '../utils/constants.js';

/**
 * Resolve the path to cli.js bundled with `@anthropic-ai/claude-agent-sdk`.
 *
 * Production (Electron): ELISA_RESOURCES_PATH is set by Electron main process;
 *   cli.js lives at <resources>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk/cli.js
 *   (afterPack renames vendor/ -> node_modules/).
 *
 * Dev: resolve relative to the SDK package via import.meta.resolve.
 *
 * This ensures the app works whether or not Claude Code is installed on the system.
 */
function resolveClaudeCodePath(): string | undefined {
  const sdkSubpath = path.join('@anthropic-ai', 'claude-agent-sdk', 'cli.js');

  // Production: use ELISA_RESOURCES_PATH set by Electron
  if (process.env.ELISA_RESOURCES_PATH) {
    const prodPath = path.join(process.env.ELISA_RESOURCES_PATH, 'backend-dist', 'node_modules', sdkSubpath);
    if (fs.existsSync(prodPath)) return prodPath;
    console.warn(`[agentRunner] cli.js not found at production path: ${prodPath}`);
  }

  // Dev: resolve from the SDK package location
  try {
    const sdkEntry = import.meta.resolve('@anthropic-ai/claude-agent-sdk');
    const sdkDir = path.dirname(fileURLToPath(sdkEntry));
    const devPath = path.join(sdkDir, 'cli.js');
    if (fs.existsSync(devPath)) return devPath;
  } catch {
    // import.meta.resolve unavailable or package not found
  }

  // Fallback: let the SDK auto-detect (works if Claude Code is in PATH)
  return undefined;
}

/** Cached resolved path (computed once at module load). */
const claudeCodePath = resolveClaudeCodePath();

/** Expose the resolved path for startup health checks. */
export function getClaudeCodePath(): string | undefined {
  return claudeCodePath;
}

/** SDK assistant message shape (subset we consume). */
interface SDKAssistantMessage {
  type: 'assistant';
  message?: { content?: Array<{ type: string; text?: string }> };
}

/** SDK result message shape (subset we consume). */
interface SDKResultMessage {
  type: 'result';
  subtype?: 'success' | string;
  result?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  errors?: string[];
}

export interface AgentRunnerParams {
  taskId: string;
  prompt: string;
  systemPrompt: string;
  onOutput: (taskId: string, content: string) => Promise<void>;
  onQuestion?: (
    taskId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape depends on SDK tool_use events; no stable schema
    payload: Record<string, any>,
  ) => Promise<Record<string, unknown>>;
  workingDir: string;
  timeout?: number;
  model?: string;
  maxTurns?: number;
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
  allowedTools?: string[];
  abortSignal?: AbortSignal;
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
      maxTurns = MAX_TURNS_DEFAULT,
      mcpServers,
      allowedTools,
    } = params;

    const mcpConfig = mcpServers?.length
      ? Object.fromEntries(mcpServers.map(s => [s.name, {
          command: s.command,
          ...(s.args ? { args: s.args } : {}),
          ...(s.env ? { env: s.env } : {}),
        }]))
      : undefined;

    const abortController = new AbortController();

    if (params.abortSignal) {
      if (params.abortSignal.aborted) {
        abortController.abort();
      } else {
        params.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true });
      }
    }

    try {
      return await withTimeout(
        this.runQuery(prompt, systemPrompt, workingDir, taskId, onOutput, model, maxTurns, mcpConfig, abortController, allowedTools),
        timeout * 1000,
      );
    } catch (err: unknown) {
      // Ensure the query is aborted on timeout or any error
      abortController.abort();
      if (err instanceof TimeoutError) {
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
        summary: err instanceof Error ? err.message : String(err),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP server config shape varies; passed directly to SDK query()
    mcpConfig?: Record<string, any>,
    abortController?: AbortController,
    allowedTools?: string[],
  ): Promise<AgentResult> {
    // In Electron production, Node.js may not be installed on the system.
    // Use the Electron binary itself as the Node.js runtime for spawning cli.js.
    const electronExecConfig = process.env.ELISA_RESOURCES_PATH
      ? { executable: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
      : {};

    const conversation = query({
      prompt,
      options: {
        cwd,
        model,
        maxTurns,
        permissionMode: 'bypassPermissions',
        systemPrompt,
        ...electronExecConfig,
        ...(claudeCodePath ? { pathToClaudeCodeExecutable: claudeCodePath } : {}),
        ...(allowedTools ? { allowedTools } : {}),
        ...(mcpConfig ? { mcpServers: mcpConfig } : {}),
        ...(abortController ? { abortController } : {}),
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
        const assistantMsg = message as SDKAssistantMessage;
        for (const block of assistantMsg.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            accumulatedText.push(block.text);
            onOutput(taskId, block.text).catch((err) => { console.error('[agentRunner] onOutput failed:', err instanceof Error ? err.message : err); });
          }
        }
      }

      if (message.type === 'result') {
        const result = message as SDKResultMessage;
        costUsd = result.total_cost_usd ?? 0;
        inputTokens = result.usage?.input_tokens ?? 0;
        outputTokens = result.usage?.output_tokens ?? 0;

        if (result.subtype === 'success') {
          finalResult = result.result ?? '';
        } else {
          success = false;
          const errors: string[] = result.errors ?? [];
          finalResult = errors.join('; ')
            || accumulatedText.slice(-3).join('\n')
            || 'Unknown error';
        }
      }
    }

    const summary = finalResult || accumulatedText.slice(-3).join('\n') || 'No output';
    return { success, summary, costUsd, inputTokens, outputTokens };
  }
}

