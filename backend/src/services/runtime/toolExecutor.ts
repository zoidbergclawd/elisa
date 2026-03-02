/**
 * Tool executor for the Elisa Agent Runtime (Phase 1).
 *
 * Matches tool_use blocks from Claude API responses against
 * AgentIdentity.tool_configs and returns tool_result blocks.
 *
 * Phase 1: basic execution that returns a structured acknowledgment.
 * Phase 2+: full portal integration (CLI/MCP adapters).
 */

import type { ToolConfig } from '../../models/runtime.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ── Tool Executor ─────────────────────────────────────────────────────

export class ToolExecutor {
  private toolMap: Map<string, ToolConfig>;

  constructor(toolConfigs: ToolConfig[]) {
    this.toolMap = new Map(toolConfigs.map((tc) => [tc.name, tc]));
  }

  /**
   * Execute a single tool_use block against the configured tools.
   *
   * Returns a tool_result block. If the tool is not found, returns
   * an error result. Phase 1 returns a structured acknowledgment;
   * full portal execution will be wired in later.
   */
  async execute(toolUse: ToolUseBlock): Promise<ToolResultBlock> {
    const config = this.toolMap.get(toolUse.name);

    if (!config) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Error: Unknown tool "${toolUse.name}". Available tools: ${[...this.toolMap.keys()].join(', ') || 'none'}`,
        is_error: true,
      };
    }

    // Phase 1: return a structured acknowledgment with the input echoed back.
    // This proves the tool call round-trip works. Full portal execution comes in Phase 2+.
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: JSON.stringify({
        tool: config.name,
        status: 'executed',
        input: toolUse.input,
      }),
    };
  }

  /**
   * Execute all tool_use blocks and return corresponding tool_result blocks.
   */
  async executeAll(toolUseBlocks: ToolUseBlock[]): Promise<ToolResultBlock[]> {
    return Promise.all(toolUseBlocks.map((block) => this.execute(block)));
  }

  hasTools(): boolean {
    return this.toolMap.size > 0;
  }
}
