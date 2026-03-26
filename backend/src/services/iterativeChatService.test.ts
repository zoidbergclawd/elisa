/** Unit tests for IterativeChatService. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IterativeChatService } from './iterativeChatService.js';
import type { WSEvent } from './phases/types.js';

// Mock AgentRunner
vi.mock('./agentRunner.js', () => {
  return {
    AgentRunner: class MockAgentRunner {
      execute = vi.fn().mockResolvedValue({
        success: true,
        summary: 'Fixed the button color',
        costUsd: 0.01,
        inputTokens: 100,
        outputTokens: 50,
      });
    },
    getClaudeCodePath: () => '/mock/cli.js',
  };
});

// Mock TestRunner
vi.mock('./testRunner.js', () => {
  return {
    TestRunner: class MockTestRunner {
      runTests = vi.fn().mockResolvedValue({
        tests: [{ test_name: 'button_test', passed: true, details: 'PASSED' }],
        passed: 1,
        failed: 0,
        total: 1,
        coverage_pct: null,
        coverage_details: null,
      });
    },
  };
});

// Mock fs -- tests dir exists
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

describe('IterativeChatService', () => {
  let service: IterativeChatService;
  let events: WSEvent[];
  let send: (event: WSEvent) => Promise<void>;

  beforeEach(() => {
    service = new IterativeChatService();
    events = [];
    send = async (event: WSEvent) => { events.push(event); };
  });

  describe('createSession', () => {
    it('creates a new chat session with default values', () => {
      const session = service.createSession('sess-1');
      expect(session.sessionId).toBe('sess-1');
      expect(session.turns).toEqual([]);
      expect(session.isProcessing).toBe(false);
      expect(session.totalTokens).toBe(0);
    });
  });

  describe('processMessage', () => {
    it('records kid turn and agent turn', async () => {
      const chatSession = service.createSession('sess-1');

      await service.processMessage(
        'sess-1',
        'Fix the button',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      expect(chatSession.turns).toHaveLength(2);
      expect(chatSession.turns[0].role).toBe('kid');
      expect(chatSession.turns[0].content).toBe('Fix the button');
      expect(chatSession.turns[1].role).toBe('agent');
      expect(chatSession.turns[1].content).toBe('Fixed the button color');
    });

    it('emits chat_processing, chat_response, and chat_tests_completed events', async () => {
      const chatSession = service.createSession('sess-1');

      await service.processMessage(
        'sess-1',
        'Fix the button',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      const types = events.map(e => e.type);
      expect(types).toContain('chat_processing');
      expect(types).toContain('chat_response');
      expect(types).toContain('chat_tests_completed');
    });

    it('tracks token usage', async () => {
      const chatSession = service.createSession('sess-1');

      await service.processMessage(
        'sess-1',
        'Fix the button',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      expect(chatSession.totalTokens).toBe(150); // 100 input + 50 output
    });

    it('sets isProcessing during execution and clears it after', async () => {
      const chatSession = service.createSession('sess-1');
      expect(chatSession.isProcessing).toBe(false);

      const promise = service.processMessage(
        'sess-1',
        'Fix the button',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      await promise;
      expect(chatSession.isProcessing).toBe(false);
    });

    it('throws when already processing', async () => {
      const chatSession = service.createSession('sess-1');
      chatSession.isProcessing = true;

      await expect(
        service.processMessage('sess-1', 'Fix it', send, '/fake', null, chatSession),
      ).rejects.toThrow('already processing');
    });

    it('emits chat_preview_refresh when files change', async () => {
      const chatSession = service.createSession('sess-1');

      // Mock the private snapshotFiles to return different snapshots before/after
      let snapshotCallCount = 0;
      vi.spyOn(service as any, 'snapshotFiles').mockImplementation(() => {
        snapshotCallCount++;
        const map = new Map<string, number>();
        if (snapshotCallCount === 1) {
          // Before snapshot
          map.set('index.js', 1000);
        } else {
          // After snapshot -- different mtime means file changed
          map.set('index.js', 2000);
        }
        return map;
      });

      await service.processMessage(
        'sess-1',
        'Change the heading',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      const types = events.map(e => e.type);
      expect(types).toContain('chat_preview_refresh');

      // Also verify the chat_response includes filesChanged
      const chatResponse = events.find(e => e.type === 'chat_response') as any;
      expect(chatResponse.filesChanged).toContain('index.js');
    });

    it('does not emit chat_tests_completed when tests dir does not exist', async () => {
      const fs = await import('node:fs');
      const chatSession = service.createSession('sess-1');

      // Make existsSync return false for tests dir
      (fs.default.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await service.processMessage(
        'sess-1',
        'Update the title',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      const types = events.map(e => e.type);
      expect(types).not.toContain('chat_tests_completed');

      // Restore default mock
      (fs.default.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('tests')) return true;
        return false;
      });
    });

    it('sends kid message text in chat_processing event', async () => {
      const chatSession = service.createSession('sess-1');

      await service.processMessage(
        'sess-1',
        'Make it blue',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      const processingEvent = events.find(e => e.type === 'chat_processing');
      expect(processingEvent).toBeDefined();
      expect((processingEvent as any).message).toBe('Make it blue');
    });

    it('emits chat_error on failure and clears isProcessing', async () => {
      const chatSession = service.createSession('sess-1');

      // Override the execute method on this instance to throw
      (service as any).agentRunner.execute = vi.fn().mockRejectedValue(new Error('agent exploded'));

      await service.processMessage(
        'sess-1',
        'Break things',
        send,
        '/fake/workspace',
        null,
        chatSession,
      );

      expect(chatSession.isProcessing).toBe(false);
      const errorEvents = events.filter(e => e.type === 'chat_error');
      expect(errorEvents).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('resets chat session state', () => {
      const chatSession = service.createSession('sess-1');
      chatSession.turns.push({ role: 'kid', content: 'hi', timestamp: 1 });
      chatSession.totalTokens = 500;
      chatSession.isProcessing = true;

      service.cleanup(chatSession);

      expect(chatSession.turns).toEqual([]);
      expect(chatSession.totalTokens).toBe(0);
      expect(chatSession.isProcessing).toBe(false);
    });
  });
});
