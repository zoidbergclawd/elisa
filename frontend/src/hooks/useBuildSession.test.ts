import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuildSession } from './useBuildSession';
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
});
