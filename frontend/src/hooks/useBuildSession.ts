import { useState, useCallback } from 'react';
import type { ProjectSpec } from '../components/BlockCanvas/blockInterpreter';
import type { UIState, Task, Agent, Commit, WSEvent } from '../types';

export function useBuildSession() {
  const [uiState, setUiState] = useState<UIState>('design');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleEvent = useCallback((event: WSEvent) => {
    setEvents(prev => [...prev, event]);

    switch (event.type) {
      case 'plan_ready':
        setTasks(event.tasks);
        setAgents(event.agents);
        break;
      case 'task_started':
        setTasks(prev => prev.map(t =>
          t.id === event.task_id ? { ...t, status: 'in_progress' as const } : t
        ));
        setAgents(prev => prev.map(a =>
          a.name === event.agent_name ? { ...a, status: 'working' as const } : a
        ));
        break;
      case 'task_completed':
        setTasks(prev => prev.map(t =>
          t.id === event.task_id ? { ...t, status: 'done' as const } : t
        ));
        setAgents(prev => prev.map(a =>
          a.status === 'working' ? { ...a, status: 'idle' as const } : a
        ));
        break;
      case 'task_failed':
        setTasks(prev => prev.map(t =>
          t.id === event.task_id ? { ...t, status: 'failed' as const } : t
        ));
        setAgents(prev => prev.map(a =>
          a.status === 'working' ? { ...a, status: 'error' as const } : a
        ));
        break;
      case 'commit_created':
        setCommits(prev => [...prev, {
          sha: event.sha,
          message: event.message,
          agent_name: event.agent_name,
          task_id: event.task_id,
          timestamp: event.timestamp,
          files_changed: event.files_changed,
        }]);
        break;
      case 'session_complete':
        setUiState('done');
        setAgents(prev => prev.map(a => ({ ...a, status: 'done' as const })));
        break;
    }
  }, []);

  const startBuild = useCallback(async (spec: ProjectSpec) => {
    setUiState('building');
    setEvents([]);
    setTasks([]);
    setAgents([]);
    setCommits([]);

    const res = await fetch('/api/sessions', { method: 'POST' });
    const { session_id } = await res.json();
    setSessionId(session_id);

    // Small delay to let WebSocket connect before starting
    await new Promise(r => setTimeout(r, 500));

    await fetch(`/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec }),
    });
  }, []);

  return { uiState, tasks, agents, commits, events, sessionId, handleEvent, startBuild };
}
