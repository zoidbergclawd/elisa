/** Behavioral tests for the iterative chat flow. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IterativeChatService, type IterativeChatSession } from '../../services/iterativeChatService.js';
import type { WSEvent } from '../../services/phases/types.js';

// Mock AgentRunner
vi.mock('../../services/agentRunner.js', () => {
  return {
    AgentRunner: class MockAgentRunner {
      execute = vi.fn().mockResolvedValue({
        success: true,
        summary: 'I made the title bigger',
        costUsd: 0.02,
        inputTokens: 200,
        outputTokens: 100,
      });
    },
    getClaudeCodePath: () => '/mock/cli.js',
  };
});

// Mock TestRunner
vi.mock('../../services/testRunner.js', () => {
  return {
    TestRunner: class MockTestRunner {
      runTests = vi.fn().mockResolvedValue({
        tests: [
          { test_name: 'title_size', passed: true, details: 'PASSED' },
          { test_name: 'color_check', passed: false, details: 'FAILED' },
        ],
        passed: 1,
        failed: 1,
        total: 2,
        coverage_pct: null,
        coverage_details: null,
      });
    },
  };
});

// Mock fs
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (typeof p === 'string' && p.includes('tests')) return true;
        return false;
      }),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false, mtimeMs: 1000 })),
    },
  };
});

describe('Iterative Chat behavioral flow', () => {
  let service: IterativeChatService;
  let events: WSEvent[];
  let send: (event: WSEvent) => Promise<void>;
  let chatSession: IterativeChatSession;

  beforeEach(() => {
    service = new IterativeChatService();
    events = [];
    send = async (event: WSEvent) => { events.push(event); };
    chatSession = service.createSession('behavior-sess');
  });

  it('completes a full chat turn: processing -> agent output -> response -> tests -> refresh', async () => {
    await service.processMessage(
      'behavior-sess',
      'Make the title bigger',
      send,
      '/fake/workspace',
      null,
      chatSession,
    );

    const types = events.map(e => e.type);

    // Must emit in correct order
    expect(types[0]).toBe('chat_processing');
    expect(types).toContain('chat_response');
    expect(types).toContain('chat_tests_completed');

    // Verify test results are propagated
    const testEvent = events.find(e => e.type === 'chat_tests_completed') as any;
    expect(testEvent.passed).toBe(1);
    expect(testEvent.failed).toBe(1);
    expect(testEvent.total).toBe(2);
  });

  it('supports multiple conversation turns', async () => {
    await service.processMessage(
      'behavior-sess',
      'Make the title bigger',
      send,
      '/fake/workspace',
      null,
      chatSession,
    );

    await service.processMessage(
      'behavior-sess',
      'Now make it red',
      send,
      '/fake/workspace',
      null,
      chatSession,
    );

    // Should have 4 turns total (2 kid + 2 agent)
    expect(chatSession.turns).toHaveLength(4);
    expect(chatSession.turns[0].role).toBe('kid');
    expect(chatSession.turns[1].role).toBe('agent');
    expect(chatSession.turns[2].role).toBe('kid');
    expect(chatSession.turns[3].role).toBe('agent');

    // Token usage should accumulate
    expect(chatSession.totalTokens).toBe(600); // 300 per turn * 2
  });

  it('prevents concurrent processing', async () => {
    chatSession.isProcessing = true;

    await expect(
      service.processMessage(
        'behavior-sess',
        'Do something',
        send,
        '/fake/workspace',
        null,
        chatSession,
      ),
    ).rejects.toThrow('already processing');
  });

  it('recovers from errors gracefully', async () => {
    // Override the agent execute method on the service instance to throw
    (service as any).agentRunner.execute = vi.fn().mockRejectedValue(new Error('network timeout'));

    const errorSession = service.createSession('error-sess');

    await service.processMessage(
      'error-sess',
      'Break it',
      send,
      '/fake/workspace',
      null,
      errorSession,
    );

    // Should emit chat_error
    const errorEvents = events.filter(e => e.type === 'chat_error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as any).message).toContain('network timeout');

    // isProcessing must be cleared
    expect(errorSession.isProcessing).toBe(false);
  });
});
