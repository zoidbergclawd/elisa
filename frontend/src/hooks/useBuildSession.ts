import { useState, useCallback, useRef } from 'react';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import type { UIState, Task, Agent, Commit, WSEvent, TeachingMoment, TestResult, TokenUsage, QuestionPayload, NarratorMessage } from '../types';
import { authFetch } from '../lib/apiClient';

export const MAX_EVENTS = 500;
export const MAX_SERIAL_LINES = 1000;

export interface SerialLine {
  line: string;
  timestamp: string;
}

export interface DeployProgress {
  step: string;
  progress: number;
}

export interface GateRequest {
  task_id: string;
  question: string;
  context: string;
}

export interface QuestionRequest {
  task_id: string;
  questions: QuestionPayload[];
}

export interface ErrorNotification {
  message: string;
  recoverable: boolean;
  timestamp: number;
}

export function useBuildSession() {
  const [uiState, setUiState] = useState<UIState>('design');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teachingMoments, setTeachingMoments] = useState<TeachingMoment[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [coveragePct, setCoveragePct] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} });
  const [serialLines, setSerialLines] = useState<SerialLine[]>([]);
  const [deployProgress, setDeployProgress] = useState<DeployProgress | null>(null);
  const [gateRequest, setGateRequest] = useState<GateRequest | null>(null);
  const [questionRequest, setQuestionRequest] = useState<QuestionRequest | null>(null);
  const [nuggetDir, setNuggetDir] = useState<string | null>(null);
  const [errorNotification, setErrorNotification] = useState<ErrorNotification | null>(null);
  const [narratorMessages, setNarratorMessages] = useState<NarratorMessage[]>([]);
  const [deployChecklist, setDeployChecklist] = useState<Array<{ name: string; prompt: string }> | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const tasksRef = useRef<Task[]>([]);

  const handleEvent = useCallback((event: WSEvent) => {
    setEvents(prev => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });

    switch (event.type) {
      case 'planning_started':
        setIsPlanning(true);
        break;
      case 'plan_ready': {
        setIsPlanning(false);
        const planTasks: Task[] = event.tasks;
        // Inject a synthetic deploy node for hardware targets
        const lastTaskId = planTasks.length > 0 ? planTasks[planTasks.length - 1].id : undefined;
        const deployTarget = event.deployment_target ?? '';
        if (deployTarget === 'esp32' || deployTarget === 'both') {
          planTasks.push({
            id: '__deploy__',
            name: 'Flash to Board',
            description: 'Flash MicroPython code to ESP32 via mpremote',
            status: 'pending',
            agent_name: '',
            dependencies: lastTaskId ? [lastTaskId] : [],
          });
        }
        setTasks(planTasks);
        tasksRef.current = planTasks;
        setAgents(event.agents);
        break;
      }
      case 'task_started':
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === event.task_id ? { ...t, status: 'in_progress' as const } : t
          );
          tasksRef.current = next;
          return next;
        });
        setAgents(prev => prev.map(a =>
          a.name === event.agent_name ? { ...a, status: 'working' as const } : a
        ));
        break;
      case 'task_completed': {
        const completedTask = tasksRef.current.find(t => t.id === event.task_id);
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === event.task_id ? { ...t, status: 'done' as const } : t
          );
          tasksRef.current = next;
          return next;
        });
        if (completedTask) {
          setAgents(prev => prev.map(a =>
            a.name === completedTask.agent_name ? { ...a, status: 'idle' as const } : a
          ));
        }
        break;
      }
      case 'task_failed': {
        const failedTask = tasksRef.current.find(t => t.id === event.task_id);
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === event.task_id ? { ...t, status: 'failed' as const } : t
          );
          tasksRef.current = next;
          return next;
        });
        if (failedTask) {
          setAgents(prev => prev.map(a =>
            a.name === failedTask.agent_name ? { ...a, status: 'error' as const } : a
          ));
        }
        break;
      }
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
      case 'deploy_started':
        setUiState('building');
        setDeployProgress({ step: 'Starting deployment...', progress: 0 });
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === '__deploy__' ? { ...t, status: 'in_progress' as const } : t
          );
          tasksRef.current = next;
          return next;
        });
        break;
      case 'deploy_progress':
        setDeployProgress({ step: event.step, progress: event.progress });
        break;
      case 'deploy_checklist':
        setDeployChecklist(event.rules);
        break;
      case 'deploy_complete':
        setDeployProgress(null);
        setDeployChecklist(null);
        if (event.url) setDeployUrl(event.url);
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === '__deploy__' ? { ...t, status: 'done' as const } : t
          );
          tasksRef.current = next;
          return next;
        });
        break;
      case 'serial_data':
        setSerialLines(prev => {
          const next = [...prev, { line: event.line, timestamp: event.timestamp }];
          return next.length > MAX_SERIAL_LINES ? next.slice(next.length - MAX_SERIAL_LINES) : next;
        });
        break;
      case 'human_gate':
        setUiState('review');
        setGateRequest({ task_id: event.task_id, question: event.question, context: event.context });
        break;
      case 'user_question':
        setQuestionRequest({ task_id: event.task_id, questions: event.questions });
        break;
      case 'session_complete':
        setUiState('done');
        setAgents(prev => prev.map(a => ({ ...a, status: 'done' as const })));
        break;
      case 'teaching_moment':
        setTeachingMoments(prev => [...prev, {
          concept: event.concept,
          headline: event.headline,
          explanation: event.explanation,
          tell_me_more: event.tell_me_more,
          related_concepts: event.related_concepts,
        }]);
        break;
      case 'test_result':
        setTestResults(prev => [...prev, {
          test_name: event.test_name,
          passed: event.passed,
          details: event.details,
        }]);
        break;
      case 'coverage_update':
        setCoveragePct(event.percentage);
        break;
      case 'token_usage':
        setTokenUsage(prev => {
          const newInput = prev.input + event.input_tokens;
          const newOutput = prev.output + event.output_tokens;
          const newCost = prev.costUsd + (event.cost_usd ?? 0);
          const agentPrev = prev.perAgent[event.agent_name] || { input: 0, output: 0 };
          return {
            input: newInput,
            output: newOutput,
            total: newInput + newOutput,
            costUsd: newCost,
            maxBudget: prev.maxBudget,
            perAgent: {
              ...prev.perAgent,
              [event.agent_name]: {
                input: agentPrev.input + event.input_tokens,
                output: agentPrev.output + event.output_tokens,
              },
            },
          };
        });
        break;
      case 'budget_warning':
        setErrorNotification({
          message: `Token budget warning: ${Math.round((event.total_tokens / event.max_budget) * 100)}% used ($${event.cost_usd.toFixed(2)})`,
          recoverable: true,
          timestamp: Date.now(),
        });
        break;
      // Skill execution events (within a build session)
      case 'skill_started':
      case 'skill_step':
      case 'skill_output':
      case 'skill_completed':
      case 'skill_error':
        // Logged to events array above; no additional state updates needed for build
        break;
      case 'skill_question':
        // During build, skill questions route through the same question modal
        setQuestionRequest({
          task_id: event.step_id,
          questions: event.questions,
        });
        break;
      case 'narrator_message':
        setNarratorMessages(prev => [...prev, {
          from: event.from,
          text: event.text,
          mood: event.mood,
          related_task_id: event.related_task_id,
          timestamp: Date.now(),
        }]);
        break;
      case 'permission_auto_resolved':
        // Logged to events array above; no additional state updates
        break;
      case 'minion_state_change':
        setAgents(prev => prev.map(a =>
          a.name === event.agent_name ? { ...a, status: event.new_status as Agent['status'] } : a
        ));
        break;
      case 'workspace_created':
        setNuggetDir(event.nugget_dir);
        break;
      case 'error': {
        // Replace technical auth/key errors with kid-friendly messages
        let errorMsg = event.message;
        if (/auth|api.key|401|invalid.*key|invalid.*x-api-key/i.test(errorMsg)) {
          errorMsg = 'Elisa can\'t connect to her AI brain. Ask your parent to check the API key!';
        }
        setErrorNotification({
          message: errorMsg,
          recoverable: event.recoverable,
          timestamp: Date.now(),
        });
        // Mark synthetic deploy node as failed if deploy-related error
        if (event.message.includes('flash') || event.message.includes('mpremote') ||
            event.message.includes('Compilation failed') || event.message.includes('board detected')) {
          setTasks(prev => {
            const next = prev.map(t =>
              t.id === '__deploy__' && t.status === 'in_progress' ? { ...t, status: 'failed' as const } : t
            );
            tasksRef.current = next;
            return next;
          });
        }
        break;
      }
    }
  }, []);

  const startBuild = useCallback(async (
    spec: NuggetSpec,
    waitForWs?: () => Promise<void>,
    workspacePath?: string,
    workspaceJson?: Record<string, unknown>,
  ) => {
    setUiState('building');
    setEvents([]);
    setTasks([]);
    tasksRef.current = [];
    setAgents([]);
    setCommits([]);
    setTeachingMoments([]);
    setTestResults([]);
    setCoveragePct(null);
    setTokenUsage({ input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} });
    setSerialLines([]);
    setDeployProgress(null);
    setDeployChecklist(null);
    setDeployUrl(null);
    setIsPlanning(false);
    setGateRequest(null);
    setQuestionRequest(null);
    setNuggetDir(null);
    setErrorNotification(null);
    setNarratorMessages([]);

    const res = await authFetch('/api/sessions', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      setUiState('design');
      setErrorNotification({ message: body.detail || 'Elisa couldn\'t get ready to build. Try again!', recoverable: true, timestamp: Date.now() });
      return;
    }
    const { session_id } = await res.json();
    setSessionId(session_id);

    // Wait for WebSocket to be open before starting the build
    if (waitForWs) {
      await waitForWs();
    }

    const startBody: Record<string, unknown> = { spec };
    if (workspacePath) {
      startBody.workspace_path = workspacePath;
      startBody.workspace_json = workspaceJson ?? {};
    }

    const startRes = await authFetch(`/api/sessions/${session_id}/start`, {
      method: 'POST',
      body: JSON.stringify(startBody),
    });
    if (!startRes.ok) {
      const body = await startRes.json().catch(() => ({ detail: startRes.statusText }));
      let message = body.detail || 'Elisa couldn\'t start building. Try again!';
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        const fieldErrors = body.errors.map((e: { path: string; message: string }) =>
          e.path ? `${e.path}: ${e.message}` : e.message
        );
        message += '\n' + fieldErrors.join('\n');
      }
      setUiState('design');
      setErrorNotification({ message, recoverable: true, timestamp: Date.now() });
    }
  }, []);

  const clearGateRequest = useCallback(() => {
    setGateRequest(null);
  }, []);

  const clearQuestionRequest = useCallback(() => {
    setQuestionRequest(null);
  }, []);

  const clearErrorNotification = useCallback(() => {
    setErrorNotification(null);
  }, []);

  const stopBuild = useCallback(async () => {
    if (!sessionId) return;
    await authFetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
    setUiState('done');
    setAgents(prev => prev.map(a => ({ ...a, status: 'done' as const })));
  }, [sessionId]);

  const resetToDesign = useCallback(() => {
    setUiState('design');
    setSessionId(null);
    setNuggetDir(null);
    setEvents([]);
    setTasks([]);
    tasksRef.current = [];
    setAgents([]);
    setCommits([]);
    setTeachingMoments([]);
    setTestResults([]);
    setCoveragePct(null);
    setSerialLines([]);
    setDeployProgress(null);
    setDeployChecklist(null);
    setDeployUrl(null);
    setIsPlanning(false);
    setGateRequest(null);
    setQuestionRequest(null);
    setErrorNotification(null);
    setNarratorMessages([]);
    setTokenUsage({ input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} });
  }, []);

  return {
    uiState, tasks, agents, commits, events, sessionId,
    teachingMoments, testResults, coveragePct, tokenUsage,
    serialLines, deployProgress, deployChecklist, deployUrl, gateRequest, questionRequest,
    nuggetDir, errorNotification, narratorMessages, isPlanning,
    handleEvent, startBuild, stopBuild, clearGateRequest, clearQuestionRequest,
    clearErrorNotification, resetToDesign,
  };
}
