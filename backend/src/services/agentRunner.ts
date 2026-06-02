/** Runs individual AI agents via the Claude Agent SDK.
 *
 * Uses the SDK's query() API to run agents programmatically. This eliminates
 * all subprocess/shell issues (Windows .cmd wrappers, ENOENT, etc.) and
 * provides native streaming, tool control, and permission management.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResult } from '../models/session.js';
import { withTimeout, TimeoutError } from '../utils/withTimeout.js';
import { MAX_TURNS_DEFAULT, EFFORT_COMPLEX_THRESHOLD, DEFAULT_MODEL } from '../utils/constants.js';

/** Path to the diagnostic log file (production only). */
const DIAG_LOG_PATH = path.join(os.tmpdir(), 'elisa-agent-diagnostics.log');

/** Append a diagnostic entry to the log file. Never throws. */
function diagLog(lines: string[]): void {
  if (!process.env.ELISA_RESOURCES_PATH) return;
  try {
    fs.appendFileSync(DIAG_LOG_PATH, lines.join('\n') + '\n');
  } catch { /* best-effort */ }
}

/**
 * Elisa-owned config directory for the Claude Code CLI subprocess.
 *
 * Pointing CLAUDE_CONFIG_DIR here isolates the CLI from the host operator's
 * personal `~/.claude` directory: the subprocess can neither fall back to a host
 * login nor pollute the operator's real credentials. Elisa is a kids' app and
 * must always run on the configured ANTHROPIC_API_KEY, never an ambient login.
 */
const ELISA_CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.elisa', 'claude-cli-config');

/**
 * Build the environment for the CLI subprocess.
 *
 * In claude-agent-sdk 0.3.x, `options.env` REPLACES process.env for the spawned
 * subprocess (it is not merged), so we spread process.env to preserve PATH and
 * friends. We then force ANTHROPIC_API_KEY (kids' app: never ride a host login)
 * and isolate CLAUDE_CONFIG_DIR to an Elisa-owned directory so the CLI cannot
 * fall back to the operator's `~/.claude` credentials.
 */
function buildSubprocessEnv(): NodeJS.ProcessEnv {
  // Best-effort: ensure the isolated config dir exists so the CLI has a writable home.
  try {
    fs.mkdirSync(ELISA_CLAUDE_CONFIG_DIR, { recursive: true });
  } catch { /* best-effort; CLI will create/handle it if absent */ }

  return {
    ...process.env,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    CLAUDE_CONFIG_DIR: ELISA_CLAUDE_CONFIG_DIR,
  };
}

/**
 * Resolve the path to the native Claude Code CLI binary shipped with
 * `@anthropic-ai/claude-agent-sdk` (0.3.x). The CLI is a per-platform native
 * executable (`claude`, or `claude.exe` on Windows) delivered as the
 * host-platform optional dependency `@anthropic-ai/claude-agent-sdk-<plat>-<arch>`.
 *
 * Production (Electron): ELISA_RESOURCES_PATH is set by Electron main process;
 *   the binary lives at
 *   <resources>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<bin>
 *   (afterPack renames vendor/ -> node_modules/).
 *
 * Dev: resolve the native subpath via createRequire(import.meta.url).resolve.
 *
 * Returning undefined lets the SDK auto-resolve the binary itself (0.3.x can do
 * this from node_modules), so the app still works if the explicit path is absent.
 */
function resolveClaudeCodePath(): string | undefined {
  const CLAUDE_BIN = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const platformPkg = `claude-agent-sdk-${process.platform}-${process.arch}`;

  // Production: use ELISA_RESOURCES_PATH set by Electron
  if (process.env.ELISA_RESOURCES_PATH) {
    const prodPath = path.join(
      process.env.ELISA_RESOURCES_PATH,
      'backend-dist', 'node_modules', '@anthropic-ai', platformPkg, CLAUDE_BIN,
    );
    if (fs.existsSync(prodPath)) return prodPath;
    console.warn(`[agentRunner] Claude binary not found at production path: ${prodPath}`);
  }

  // Dev: resolve the native subpath from the host-platform optional dependency
  try {
    const nodeRequire = createRequire(import.meta.url);
    const devPath = nodeRequire.resolve(`@anthropic-ai/${platformPkg}/${CLAUDE_BIN}`);
    if (fs.existsSync(devPath)) return devPath;
  } catch {
    // optional dep not present (foreign arch / --omit=optional); fall through
  }

  // Fallback: let the SDK auto-resolve the native binary from node_modules
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
  complexity?: number;
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
      model = process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      maxTurns = MAX_TURNS_DEFAULT,
      complexity,
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
        this.runQuery(prompt, systemPrompt, workingDir, taskId, onOutput, model, maxTurns, mcpConfig, abortController, allowedTools, complexity),
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
    complexity?: number,
  ): Promise<AgentResult> {
    // In Electron production, capture stderr for diagnostics.
    const isElectronProd = !!process.env.ELISA_RESOURCES_PATH;
    const stderrChunks: string[] = [];
    const electronExecConfig = isElectronProd
      ? { stderr: (data: string) => { stderrChunks.push(data); } }
      : {};

    diagLog([
      `\n=== Agent spawn: ${new Date().toISOString()} ===`,
      `Task: ${taskId}`,
      `Executable: ${process.execPath}`,
      `claude binary path: ${claudeCodePath ?? '(auto-resolve)'}`,
      `CWD: ${cwd}`,
      `Model: ${model}`,
      `Node: ${process.version}`,
      `Electron: ${(process.versions as Record<string, string>).electron ?? 'N/A'}`,
      `Platform: ${process.platform} ${process.arch}`,
      `API key: ${process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : 'NOT SET'}`,
      `ELISA_RESOURCES_PATH: ${process.env.ELISA_RESOURCES_PATH ?? 'not set'}`,
      `CLAUDE_CODE_GIT_BASH_PATH: ${process.env.CLAUDE_CODE_GIT_BASH_PATH ?? 'not set'}`,
    ]);

    const isComplex = complexity !== undefined && complexity > EFFORT_COMPLEX_THRESHOLD;

    // Build the subprocess environment. As of claude-agent-sdk 0.3.x, options.env
    // REPLACES process.env for the CLI subprocess (it is not merged), so we must
    // spread process.env ourselves or the subprocess loses everything (PATH, etc.).
    //
    // Elisa is a kids' app: every agent MUST run on the configured ANTHROPIC_API_KEY
    // and must NEVER silently ride a host ~/.claude login. We force the key explicitly
    // and point CLAUDE_CONFIG_DIR at an Elisa-owned directory so the CLI cannot fall
    // back to (or write into) the operator's personal Claude credentials.
    const subprocessEnv = buildSubprocessEnv();

    const conversation = query({
      prompt,
      options: {
        cwd,
        model,
        maxTurns,
        permissionMode: 'bypassPermissions',
        systemPrompt,
        effort: isComplex ? 'max' : 'high',
        thinking: { type: 'adaptive' },
        maxBudgetUsd: isComplex ? 5.0 : 2.0,
        env: subprocessEnv,
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

    try {
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

    diagLog([`Result: success=${success}, cost=$${costUsd.toFixed(4)}`]);
    } catch (err: unknown) {
      diagLog([
        `ERROR: ${err instanceof Error ? err.message : String(err)}`,
        ...(err instanceof Error && err.stack ? [`Stack: ${err.stack}`] : []),
        ...(stderrChunks.length > 0
          ? ['--- stderr ---', ...stderrChunks, '--- end stderr ---']
          : ['(no stderr captured)']),
      ]);
      throw err;
    }

    const summary = finalResult || accumulatedText.slice(-3).join('\n') || 'No output';
    return { success, summary, costUsd, inputTokens, outputTokens };
  }
}

