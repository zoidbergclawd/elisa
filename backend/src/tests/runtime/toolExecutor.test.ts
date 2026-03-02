/** Tests for ToolExecutor: tool lookup, execution, error handling. */

import { describe, it, expect } from 'vitest';
import { ToolExecutor } from '../../services/runtime/toolExecutor.js';
import type { ToolUseBlock } from '../../services/runtime/toolExecutor.js';
import type { ToolConfig } from '../../models/runtime.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeToolConfigs(): ToolConfig[] {
  return [
    {
      id: 'weather-portal',
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: { location: { type: 'string' } },
    },
    {
      id: 'calculator-portal',
      name: 'calculate',
      description: 'Perform a calculation',
      parameters: { expression: { type: 'string' } },
    },
  ];
}

function makeToolUse(overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return {
    type: 'tool_use',
    id: 'toolu_001',
    name: 'get_weather',
    input: { location: 'San Francisco' },
    ...overrides,
  };
}

// ── ToolExecutor ─────────────────────────────────────────────────────

describe('ToolExecutor', () => {
  describe('execute', () => {
    it('returns a successful result for a known tool', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const result = await executor.execute(makeToolUse());

      expect(result.type).toBe('tool_result');
      expect(result.tool_use_id).toBe('toolu_001');
      expect(result.is_error).toBeUndefined();

      const parsed = JSON.parse(result.content);
      expect(parsed.tool).toBe('get_weather');
      expect(parsed.status).toBe('executed');
      expect(parsed.input).toEqual({ location: 'San Francisco' });
    });

    it('returns an error result for an unknown tool', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const result = await executor.execute(
        makeToolUse({ name: 'nonexistent_tool', id: 'toolu_002' }),
      );

      expect(result.type).toBe('tool_result');
      expect(result.tool_use_id).toBe('toolu_002');
      expect(result.is_error).toBe(true);
      expect(result.content).toContain('Unknown tool "nonexistent_tool"');
      expect(result.content).toContain('get_weather');
      expect(result.content).toContain('calculate');
    });

    it('returns an error listing no tools when executor has none', async () => {
      const executor = new ToolExecutor([]);
      const result = await executor.execute(makeToolUse({ name: 'anything' }));

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('Available tools: none');
    });

    it('matches tools by name, not by id', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const result = await executor.execute(
        makeToolUse({ name: 'calculate', input: { expression: '2+2' } }),
      );

      expect(result.is_error).toBeUndefined();
      const parsed = JSON.parse(result.content);
      expect(parsed.tool).toBe('calculate');
    });
  });

  describe('executeAll', () => {
    it('executes multiple tool_use blocks in parallel', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const blocks: ToolUseBlock[] = [
        makeToolUse({ id: 'toolu_001', name: 'get_weather', input: { location: 'NYC' } }),
        makeToolUse({ id: 'toolu_002', name: 'calculate', input: { expression: '1+1' } }),
      ];

      const results = await executor.executeAll(blocks);

      expect(results).toHaveLength(2);
      expect(results[0].tool_use_id).toBe('toolu_001');
      expect(results[1].tool_use_id).toBe('toolu_002');
      expect(results.every((r) => r.type === 'tool_result')).toBe(true);
    });

    it('returns empty array for empty input', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const results = await executor.executeAll([]);
      expect(results).toEqual([]);
    });

    it('handles mix of known and unknown tools', async () => {
      const executor = new ToolExecutor(makeToolConfigs());
      const blocks: ToolUseBlock[] = [
        makeToolUse({ id: 'toolu_001', name: 'get_weather' }),
        makeToolUse({ id: 'toolu_002', name: 'unknown_tool' }),
      ];

      const results = await executor.executeAll(blocks);

      expect(results[0].is_error).toBeUndefined();
      expect(results[1].is_error).toBe(true);
    });
  });

  describe('hasTools', () => {
    it('returns true when tools are configured', () => {
      expect(new ToolExecutor(makeToolConfigs()).hasTools()).toBe(true);
    });

    it('returns false when no tools are configured', () => {
      expect(new ToolExecutor([]).hasTools()).toBe(false);
    });
  });
});
