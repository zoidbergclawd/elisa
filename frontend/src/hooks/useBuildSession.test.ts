import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuildSession, MAX_SERIAL_LINES } from './useBuildSession';
import type { WSEvent } from '../types';

describe('useBuildSession', () => {
  it('starts in design state with empty arrays', () => {
    const { result } = renderHook(() => useBuildSession());
    expect(result.current.uiState).toBe('design');
    expect(result.current.tasks).toEqual([]);
    expect(result.current.agents).toEqual([]);
    expect(result.current.commits).toEqual([]);
    expect(result.current.events).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it('handles plan_ready event', () => {
    const { result } = renderHook(() => useBuildSession());
    const event: WSEvent = {
      type: 'plan_ready',
      tasks: [{ id: 't1', name: 'Build', description: '', status: 'pending', agent_name: 'Sparky', dependencies: [] }],
      agents: [{ name: 'Sparky', role: 'builder', persona: 'A builder', status: 'idle' }],
      explanation: 'Plan ready',
    };
    act(() => result.current.handleEvent(event));
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe('t1');
    expect(result.current.agents).toHaveLength(1);
  });

  it('handles task_started event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'plan_ready',
        tasks: [{ id: 't1', name: 'Build', description: '', status: 'pending', agent_name: 'Sparky', dependencies: [] }],
        agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'idle' }],
        explanation: '',
      });
    });
    act(() => {
      result.current.handleEvent({ type: 'task_started', task_id: 't1', agent_name: 'Sparky' });
    });
    expect(result.current.tasks[0].status).toBe('in_progress');
    expect(result.current.agents[0].status).toBe('working');
  });

  it('handles task_completed event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'plan_ready',
        tasks: [{ id: 't1', name: 'Build', description: '', status: 'pending', agent_name: 'Sparky', dependencies: [] }],
        agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'working' }],
        explanation: '',
      });
    });
    act(() => {
      result.current.handleEvent({ type: 'task_completed', task_id: 't1', summary: 'Done' });
    });
    expect(result.current.tasks[0].status).toBe('done');
    expect(result.current.agents[0].status).toBe('idle');
  });

  it('handles task_failed event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'plan_ready',
        tasks: [{ id: 't1', name: 'Build', description: '', status: 'pending', agent_name: 'Sparky', dependencies: [] }],
        agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'working' }],
        explanation: '',
      });
    });
    act(() => {
      result.current.handleEvent({ type: 'task_failed', task_id: 't1', error: 'Oops', retry_count: 2 });
    });
    expect(result.current.tasks[0].status).toBe('failed');
    expect(result.current.agents[0].status).toBe('error');
  });

  it('handles commit_created event', () => {
    const { result } = renderHook(() => useBuildSession());
    const commitEvent: WSEvent = {
      type: 'commit_created',
      sha: 'abc1234',
      message: 'Sparky: Build login',
      agent_name: 'Sparky',
      task_id: 't1',
      timestamp: '2026-02-10T12:00:00Z',
      files_changed: ['src/login.py'],
    };
    act(() => result.current.handleEvent(commitEvent));
    expect(result.current.commits).toHaveLength(1);
    expect(result.current.commits[0].sha).toBe('abc1234');
    expect(result.current.commits[0].agent_name).toBe('Sparky');
    expect(result.current.commits[0].files_changed).toEqual(['src/login.py']);
  });

  it('accumulates multiple commits', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'commit_created', sha: 'aaa', message: 'First',
        agent_name: 'Sparky', task_id: 't1', timestamp: '', files_changed: [],
      });
    });
    act(() => {
      result.current.handleEvent({
        type: 'commit_created', sha: 'bbb', message: 'Second',
        agent_name: 'Checkers', task_id: 't2', timestamp: '', files_changed: [],
      });
    });
    expect(result.current.commits).toHaveLength(2);
  });

  it('handles session_complete event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'plan_ready',
        tasks: [],
        agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'idle' }],
        explanation: '',
      });
    });
    act(() => {
      result.current.handleEvent({ type: 'session_complete', summary: 'All done' });
    });
    expect(result.current.uiState).toBe('done');
    expect(result.current.agents[0].status).toBe('done');
  });

  it('accumulates all events', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => result.current.handleEvent({ type: 'planning_started' }));
    act(() => result.current.handleEvent({ type: 'session_complete', summary: '' }));
    expect(result.current.events).toHaveLength(2);
  });

  it('handles teaching_moment event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'teaching_moment',
        concept: 'source_control',
        headline: 'Saving work!',
        explanation: 'Your helpers are saving.',
        tell_me_more: 'More info here',
      });
    });
    expect(result.current.teachingMoments).toHaveLength(1);
    expect(result.current.teachingMoments[0].headline).toBe('Saving work!');
    expect(result.current.teachingMoments[0].tell_me_more).toBe('More info here');
  });

  it('handles test_result event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'test_result',
        test_name: 'test_add',
        passed: true,
        details: 'PASSED',
      });
    });
    expect(result.current.testResults).toHaveLength(1);
    expect(result.current.testResults[0].passed).toBe(true);
  });

  it('handles coverage_update event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'coverage_update',
        percentage: 85.5,
      });
    });
    expect(result.current.coveragePct).toBe(85.5);
  });

  it('handles token_usage event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'token_usage',
        agent_name: 'Sparky',
        input_tokens: 100,
        output_tokens: 50,
      });
    });
    expect(result.current.tokenUsage.input).toBe(100);
    expect(result.current.tokenUsage.output).toBe(50);
    expect(result.current.tokenUsage.total).toBe(150);
    expect(result.current.tokenUsage.perAgent['Sparky']).toEqual({ input: 100, output: 50 });
  });

  it('accumulates token_usage across agents', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'token_usage', agent_name: 'Sparky', input_tokens: 100, output_tokens: 50,
      });
    });
    act(() => {
      result.current.handleEvent({
        type: 'token_usage', agent_name: 'Checkers', input_tokens: 200, output_tokens: 100,
      });
    });
    expect(result.current.tokenUsage.total).toBe(450);
    expect(result.current.tokenUsage.perAgent['Sparky']).toEqual({ input: 100, output: 50 });
    expect(result.current.tokenUsage.perAgent['Checkers']).toEqual({ input: 200, output: 100 });
  });

  it('initializes new state correctly', () => {
    const { result } = renderHook(() => useBuildSession());
    expect(result.current.teachingMoments).toEqual([]);
    expect(result.current.testResults).toEqual([]);
    expect(result.current.coveragePct).toBeNull();
    expect(result.current.tokenUsage).toEqual({ input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} });
    expect(result.current.serialLines).toEqual([]);
    expect(result.current.deployProgress).toBeNull();
    expect(result.current.gateRequest).toBeNull();
  });

  it('handles serial_data event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'serial_data',
        line: 'Hello from board',
        timestamp: '2026-02-10T12:00:00Z',
      });
    });
    expect(result.current.serialLines).toHaveLength(1);
    expect(result.current.serialLines[0].line).toBe('Hello from board');
  });

  it('handles deploy_started event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({ type: 'deploy_started', target: 'esp32' });
    });
    expect(result.current.uiState).toBe('building');
    expect(result.current.deployProgress).toEqual({ step: 'Starting deployment...', progress: 0 });
  });

  it('handles deploy_progress event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({ type: 'deploy_progress', step: 'Flashing...', progress: 60 });
    });
    expect(result.current.deployProgress).toEqual({ step: 'Flashing...', progress: 60 });
  });

  it('handles deploy_complete event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({ type: 'deploy_started', target: 'esp32' });
    });
    act(() => {
      result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' });
    });
    expect(result.current.deployProgress).toBeNull();
  });

  it('handles human_gate event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'human_gate',
        task_id: 'task-3',
        question: 'Check this out?',
        context: 'Built the UI',
      });
    });
    expect(result.current.uiState).toBe('review');
    expect(result.current.gateRequest).toEqual({
      task_id: 'task-3',
      question: 'Check this out?',
      context: 'Built the UI',
    });
  });

  it('clearGateRequest clears gate request', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'human_gate',
        task_id: 'task-3',
        question: 'Check?',
        context: 'ctx',
      });
    });
    expect(result.current.gateRequest).not.toBeNull();
    act(() => {
      result.current.clearGateRequest();
    });
    expect(result.current.gateRequest).toBeNull();
  });

  it('caps serial lines at MAX_SERIAL_LINES, dropping oldest entries', () => {
    const { result } = renderHook(() => useBuildSession());
    // Feed MAX_SERIAL_LINES + 50 serial_data events
    act(() => {
      for (let i = 0; i < MAX_SERIAL_LINES + 50; i++) {
        result.current.handleEvent({
          type: 'serial_data',
          line: `line-${i}`,
          timestamp: `2026-02-10T12:00:${String(i).padStart(2, '0')}Z`,
        });
      }
    });
    expect(result.current.serialLines.length).toBe(MAX_SERIAL_LINES);
    // The oldest 50 lines should have been dropped
    expect(result.current.serialLines[0].line).toBe('line-50');
    expect(result.current.serialLines[MAX_SERIAL_LINES - 1].line).toBe(`line-${MAX_SERIAL_LINES + 49}`);
  });

  it('does not trim serial lines when under the cap', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.handleEvent({
          type: 'serial_data',
          line: `line-${i}`,
          timestamp: '2026-02-10T12:00:00Z',
        });
      }
    });
    expect(result.current.serialLines.length).toBe(10);
    expect(result.current.serialLines[0].line).toBe('line-0');
  });

  it('handles narrator_message event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'narrator_message',
        from: 'Elisa',
        text: 'Your minion is getting started!',
        mood: 'excited',
      } as any);
    });
    expect(result.current.narratorMessages).toHaveLength(1);
    expect(result.current.narratorMessages[0].text).toBe('Your minion is getting started!');
    expect(result.current.narratorMessages[0].mood).toBe('excited');
  });

  it('handles deploy_checklist event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'deploy_checklist',
        rules: [
          { name: 'Must compile', prompt: 'Code must compile cleanly' },
          { name: 'Tests pass', prompt: 'All tests must pass' },
        ],
      });
    });
    expect(result.current.deployChecklist).toHaveLength(2);
    expect(result.current.deployChecklist![0].name).toBe('Must compile');
    expect(result.current.deployChecklist![1].prompt).toBe('All tests must pass');
  });

  it('clears deploy_checklist on deploy_complete', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'deploy_checklist',
        rules: [{ name: 'Rule', prompt: 'Prompt' }],
      });
    });
    expect(result.current.deployChecklist).toHaveLength(1);
    act(() => {
      result.current.handleEvent({ type: 'deploy_complete', target: 'esp32' });
    });
    expect(result.current.deployChecklist).toBeNull();
  });

  it('handles minion_state_change event', () => {
    const { result } = renderHook(() => useBuildSession());
    act(() => {
      result.current.handleEvent({
        type: 'plan_ready',
        tasks: [],
        agents: [{ name: 'Sparky', role: 'builder', persona: '', status: 'idle' }],
        explanation: '',
      });
    });
    act(() => {
      result.current.handleEvent({
        type: 'minion_state_change',
        agent_name: 'Sparky',
        old_status: 'idle',
        new_status: 'waiting',
      } as any);
    });
    expect(result.current.agents[0].status).toBe('waiting');
  });

  describe('startBuild validation error handling', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('surfaces Zod validation errors with per-field messages', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            detail: 'Invalid NuggetSpec',
            errors: [
              { path: 'nugget.goal', message: 'Required' },
              { path: 'nugget.language', message: 'Invalid enum value' },
            ],
          }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: '', language: 'python' } } as never);
      });

      expect(result.current.uiState).toBe('design');
      expect(result.current.errorNotification).not.toBeNull();
      expect(result.current.errorNotification!.message).toContain('Invalid NuggetSpec');
      expect(result.current.errorNotification!.message).toContain('nugget.goal: Required');
      expect(result.current.errorNotification!.message).toContain('nugget.language: Invalid enum value');
      expect(result.current.errorNotification!.recoverable).toBe(true);
    });

    it('reads body.detail (not body.error) for non-validation errors', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ detail: 'Session already started' }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x', language: 'python' } } as never);
      });

      expect(result.current.errorNotification!.message).toBe('Session already started');
    });

    it('reads body.detail for session creation errors', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ detail: 'Server overloaded' }),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x', language: 'python' } } as never);
      });

      expect(result.current.uiState).toBe('design');
      expect(result.current.errorNotification!.message).toBe('Server overloaded');
    });

    it('falls back to generic message when body has no detail', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 's1' }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({}),
        });

      const { result } = renderHook(() => useBuildSession());
      await act(async () => {
        await result.current.startBuild({ nugget: { goal: 'x', language: 'python' } } as never);
      });

      expect(result.current.errorNotification!.message).toBe('Failed to start build');
    });
  });
});
