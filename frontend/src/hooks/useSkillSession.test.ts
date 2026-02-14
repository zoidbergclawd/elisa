import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSkillSession } from './useSkillSession';

// Minimal mock WebSocket that lets tests trigger lifecycle events
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn(() => { this.readyState = 3; });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const mockPlan = {
  skillId: 'skill-1',
  skillName: 'Test Skill',
  steps: [
    { id: 'step-1', type: 'run_agent' as const, prompt: 'Do something', storeAs: 'result' },
  ],
};

const mockAllSkills = [
  { id: 'skill-1', name: 'Test Skill', prompt: 'Do something', category: 'agent' },
];

describe('useSkillSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it('starts with idle state', () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    const { result } = renderHook(() => useSkillSession());

    expect(result.current.sessionId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.steps).toEqual([]);
    expect(result.current.outputs).toEqual([]);
    expect(result.current.questionRequest).toBeNull();
  });

  it('starts a skill run and sets sessionId', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-abc' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    expect(result.current.sessionId).toBe('sess-abc');
    expect(fetch).toHaveBeenCalledWith('/api/skills/run', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('sets error when startRun fetch fails', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: 'Skill not found' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    expect(result.current.error).toBe('Skill not found');
    expect(result.current.sessionId).toBeNull();
  });

  it('sets fallback error when startRun json parsing fails', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('invalid json')),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    expect(result.current.error).toBe('Bad Gateway');
  });

  it('handles skill_started event', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    // WebSocket should be created for the session
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({ type: 'skill_started', skill_id: 'skill-1', skill_name: 'Test Skill' });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('handles skill_step event - adds new step', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({
        type: 'skill_step',
        skill_id: 'skill-1',
        step_id: 'step-1',
        step_type: 'run_agent',
        status: 'started',
      });
    });

    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0]).toEqual({
      stepId: 'step-1',
      stepType: 'run_agent',
      status: 'started',
    });
  });

  it('handles skill_step event - updates existing step', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    // Start step
    act(() => {
      ws.simulateMessage({
        type: 'skill_step',
        skill_id: 'skill-1',
        step_id: 'step-1',
        step_type: 'run_agent',
        status: 'started',
      });
    });

    // Complete step
    act(() => {
      ws.simulateMessage({
        type: 'skill_step',
        skill_id: 'skill-1',
        step_id: 'step-1',
        step_type: 'run_agent',
        status: 'completed',
      });
    });

    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0].status).toBe('completed');
  });

  it('handles skill_question event', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    const questions = [
      {
        question: 'Pick a color',
        header: 'Color Choice',
        options: [
          { label: 'Red', description: 'The color red' },
          { label: 'Blue', description: 'The color blue' },
        ],
        multiSelect: false,
      },
    ];

    act(() => {
      ws.simulateMessage({
        type: 'skill_question',
        skill_id: 'skill-1',
        step_id: 'step-2',
        questions,
      });
    });

    expect(result.current.questionRequest).toEqual({
      stepId: 'step-2',
      questions,
    });
  });

  it('handles skill_output event', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({
        type: 'skill_output',
        skill_id: 'skill-1',
        step_id: 'step-1',
        content: 'Generated code line 1',
      });
    });

    act(() => {
      ws.simulateMessage({
        type: 'skill_output',
        skill_id: 'skill-1',
        step_id: 'step-1',
        content: 'Generated code line 2',
      });
    });

    expect(result.current.outputs).toEqual([
      'Generated code line 1',
      'Generated code line 2',
    ]);
  });

  it('handles skill_completed event', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({ type: 'skill_started', skill_id: 'skill-1', skill_name: 'Test Skill' });
    });

    act(() => {
      ws.simulateMessage({ type: 'skill_completed', skill_id: 'skill-1', result: 'All done!' });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.result).toBe('All done!');
  });

  it('handles skill_error event', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-1' }),
    }));

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({ type: 'skill_started', skill_id: 'skill-1', skill_name: 'Test Skill' });
    });

    act(() => {
      ws.simulateMessage({ type: 'skill_error', skill_id: 'skill-1', message: 'Agent failed' });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe('Agent failed');
  });

  it('answerQuestion posts to the correct endpoint and clears questionRequest', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: 'sess-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());

    // Set a question request via event
    act(() => {
      ws.simulateMessage({
        type: 'skill_question',
        skill_id: 'skill-1',
        step_id: 'step-2',
        questions: [{ question: 'Pick one', header: 'Choice', options: [], multiSelect: false }],
      });
    });

    expect(result.current.questionRequest).not.toBeNull();

    await act(async () => {
      await result.current.answerQuestion('step-2', { choice: 'A' });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/skills/sess-1/answer', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_id: 'step-2', answers: { choice: 'A' } }),
    }));

    expect(result.current.questionRequest).toBeNull();
  });

  it('answerQuestion sets error on failure', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ session_id: 'sess-1' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid answer' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    await act(async () => {
      await result.current.answerQuestion('step-2', { choice: 'A' });
    });

    expect(result.current.error).toBe('Invalid answer');
  });

  it('does not call answerQuestion when sessionId is null', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSkillSession());

    await act(async () => {
      await result.current.answerQuestion('step-2', { choice: 'A' });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resets state on new startRun', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session_id: `sess-${callCount}` }),
      });
    }));

    const { result } = renderHook(() => useSkillSession());

    // First run
    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    const ws1 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws1.simulateOpen());

    // Simulate some events to populate state
    act(() => {
      ws1.simulateMessage({ type: 'skill_started', skill_id: 'skill-1', skill_name: 'Test Skill' });
    });
    act(() => {
      ws1.simulateMessage({
        type: 'skill_step',
        skill_id: 'skill-1',
        step_id: 'step-1',
        step_type: 'run_agent',
        status: 'completed',
      });
    });
    act(() => {
      ws1.simulateMessage({
        type: 'skill_output',
        skill_id: 'skill-1',
        step_id: 'step-1',
        content: 'output from run 1',
      });
    });
    act(() => {
      ws1.simulateMessage({ type: 'skill_completed', skill_id: 'skill-1', result: 'Done!' });
    });

    expect(result.current.steps).toHaveLength(1);
    expect(result.current.outputs).toHaveLength(1);
    expect(result.current.result).toBe('Done!');

    // Second run should reset all state
    await act(async () => {
      await result.current.startRun(mockPlan, mockAllSkills);
    });

    expect(result.current.steps).toEqual([]);
    expect(result.current.outputs).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.questionRequest).toBeNull();
  });
});
