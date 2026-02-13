import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

// Import after mock is set up
const { NarratorService } = await import('../narratorService.js');

describe('NarratorService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockApiResponse(text: string) {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text }],
    });
  }

  describe('translate()', () => {
    it('returns valid NarratorMessage format', async () => {
      mockApiResponse('{"text": "Builder Bot is on it!", "mood": "excited"}');

      const service = new NarratorService();
      const msg = await service.translate('task_started', 'Builder Bot', 'Scaffold HTML', 'Build a game');

      expect(msg).toEqual({ text: 'Builder Bot is on it!', mood: 'excited' });
    });

    it('returns fallback on timeout', async () => {
      createMock.mockRejectedValue(new Error('AbortError'));

      const service = new NarratorService();
      const msg = await service.translate('task_started', 'Builder Bot', 'Scaffold HTML', 'Build a game');

      expect(msg.text).toBe('Builder Bot is getting to work!');
      expect(msg.mood).toBe('excited');
    });

    it('returns fallback on API error', async () => {
      createMock.mockRejectedValue(new Error('API rate limit'));

      const service = new NarratorService();
      const msg = await service.translate('task_failed', 'Test Bot', 'Tests failed', 'Build a game');

      expect(msg.text).toContain('Test Bot');
      expect(msg.mood).toBe('concerned');
    });
  });

  describe('fallback moods per event type', () => {
    let service: InstanceType<typeof NarratorService>;

    beforeEach(() => {
      createMock.mockRejectedValue(new Error('API error'));
      service = new NarratorService();
    });

    it('task_started -> excited', async () => {
      const msg = await service.translate('task_started', 'Bot', '', '');
      expect(msg.mood).toBe('excited');
    });

    it('task_completed -> celebrating', async () => {
      const msg = await service.translate('task_completed', 'Bot', '', '');
      expect(msg.mood).toBe('celebrating');
    });

    it('task_failed -> concerned', async () => {
      const msg = await service.translate('task_failed', 'Bot', '', '');
      expect(msg.mood).toBe('concerned');
    });

    it('session_complete -> celebrating', async () => {
      const msg = await service.translate('session_complete', 'Bot', '', '');
      expect(msg.mood).toBe('celebrating');
    });

    it('error -> concerned', async () => {
      const msg = await service.translate('error', 'Bot', '', '');
      expect(msg.mood).toBe('concerned');
    });

    it('unknown event -> encouraging', async () => {
      const msg = await service.translate('agent_output', 'Bot', '', '');
      expect(msg.mood).toBe('encouraging');
    });
  });

  describe('accumulateOutput()', () => {
    it('debounces and fires after 2s of silence', async () => {
      mockApiResponse('{"text": "Making progress!", "mood": "excited"}');

      const service = new NarratorService();
      const onTranslated = vi.fn();

      service.accumulateOutput('task-1', 'output 1', 'Bot', 'Build a game', onTranslated);
      service.accumulateOutput('task-1', 'output 2', 'Bot', 'Build a game', onTranslated);
      service.accumulateOutput('task-1', 'output 3', 'Bot', 'Build a game', onTranslated);

      // Should not have fired yet
      expect(onTranslated).not.toHaveBeenCalled();

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(2100);

      expect(onTranslated).toHaveBeenCalledOnce();
      expect(onTranslated).toHaveBeenCalledWith({ text: 'Making progress!', mood: 'excited' });
    });
  });

  describe('flushTask()', () => {
    it('clears pending buffer and timer', async () => {
      const service = new NarratorService();
      const onTranslated = vi.fn();

      service.accumulateOutput('task-1', 'output 1', 'Bot', 'Build a game', onTranslated);
      service.flushTask('task-1');

      await vi.advanceTimersByTimeAsync(3000);

      expect(onTranslated).not.toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('clears all state', async () => {
      mockApiResponse('{"text": "Hello!", "mood": "excited"}');

      const service = new NarratorService();
      await service.translate('task_started', 'Bot', '', '');

      expect(service.getHistory()).toHaveLength(1);

      service.reset();

      expect(service.getHistory()).toHaveLength(0);
    });
  });

  describe('getHistory()', () => {
    it('returns recent messages', async () => {
      const service = new NarratorService();

      mockApiResponse('{"text": "Message 1", "mood": "excited"}');
      await service.translate('task_started', 'Bot', 'task 1', '');

      mockApiResponse('{"text": "Message 2", "mood": "celebrating"}');
      await service.translate('task_completed', 'Bot', 'done', '');

      const history = service.getHistory();
      expect(history).toEqual(['Message 1', 'Message 2']);
    });

    it('caps history at 10 entries', async () => {
      const service = new NarratorService();

      for (let i = 0; i < 12; i++) {
        mockApiResponse(`{"text": "Message ${i}", "mood": "excited"}`);
        await service.translate('task_started', 'Bot', `task ${i}`, '');
      }

      const history = service.getHistory();
      expect(history).toHaveLength(10);
      expect(history[0]).toBe('Message 2');
      expect(history[9]).toBe('Message 11');
    });
  });

  describe('isTranslatable()', () => {
    it('returns true for translatable events', () => {
      const service = new NarratorService();
      expect(service.isTranslatable('task_started')).toBe(true);
      expect(service.isTranslatable('task_completed')).toBe(true);
      expect(service.isTranslatable('task_failed')).toBe(true);
      expect(service.isTranslatable('agent_message')).toBe(true);
      expect(service.isTranslatable('error')).toBe(true);
      expect(service.isTranslatable('session_complete')).toBe(true);
    });

    it('returns false for non-translatable events', () => {
      const service = new NarratorService();
      expect(service.isTranslatable('agent_output')).toBe(false);
      expect(service.isTranslatable('commit_created')).toBe(false);
      expect(service.isTranslatable('token_usage')).toBe(false);
    });
  });

  describe('parseResponse edge cases', () => {
    it('handles JSON wrapped in markdown code fences', async () => {
      mockApiResponse('```json\n{"text": "Hello!", "mood": "celebrating"}\n```');

      const service = new NarratorService();
      const msg = await service.translate('task_completed', 'Bot', '', '');
      expect(msg.text).toBe('Hello!');
      expect(msg.mood).toBe('celebrating');
    });

    it('uses encouraging as default mood for invalid mood values', async () => {
      mockApiResponse('{"text": "Working on it", "mood": "invalid_mood"}');

      const service = new NarratorService();
      const msg = await service.translate('task_started', 'Bot', '', '');
      expect(msg.text).toBe('Working on it');
      expect(msg.mood).toBe('encouraging');
    });

    it('falls back gracefully for non-JSON response', async () => {
      mockApiResponse('Builder Bot is working hard!');

      const service = new NarratorService();
      const msg = await service.translate('task_started', 'Bot', '', '');
      expect(msg.text).toBe('Builder Bot is working hard!');
      expect(msg.mood).toBe('encouraging');
    });
  });
});
