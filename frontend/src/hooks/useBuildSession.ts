import { useReducer, useCallback, useRef } from 'react';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import type { UIState, Task, Agent, Commit, WSEvent, TeachingMoment, TestResult, TokenUsage, QuestionPayload, NarratorMessage, TraceabilitySummary, CorrectionCycleState, HealthHistoryEntry } from '../types';
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

export interface PreFlashChecklist {
  specReady: boolean;
  runtimeProvisioned: boolean;
  backpackReady: boolean;
  firmwareReady: boolean;
}

export interface FlashWizardState {
  visible: boolean;
  deviceRole: string;
  message: string;
  isFlashing: boolean;
  progress: number;
  deviceName?: string;
  flashMethod?: string;
  agentName?: string;
  wakeWord?: string;
  agentId?: string;
  preFlashChecklist?: PreFlashChecklist;
}

export interface ContextFlow {
  from_task_id: string;
  to_task_ids: string[];
  summary_preview: string;
  timestamp: number;
}

// -- State --

export interface BuildSessionState {
  uiState: UIState;
  tasks: Task[];
  agents: Agent[];
  commits: Commit[];
  events: WSEvent[];
  sessionId: string | null;
  teachingMoments: TeachingMoment[];
  testResults: TestResult[];
  coveragePct: number | null;
  tokenUsage: TokenUsage;
  serialLines: SerialLine[];
  deployProgress: DeployProgress | null;
  deployChecklist: Array<{ name: string; prompt: string }> | null;
  deployUrls: Record<string, string>;
  gateRequest: GateRequest | null;
  questionRequest: QuestionRequest | null;
  nuggetDir: string | null;
  errorNotification: ErrorNotification | null;
  narratorMessages: NarratorMessage[];
  isPlanning: boolean;
  flashWizardState: FlashWizardState | null;
  documentationPath: string | null;
  contextFlows: ContextFlow[];
  traceability: TraceabilitySummary | null;
  correctionCycles: Record<string, CorrectionCycleState>;
  decomposition: { goal: string; subtasks: string[]; explanation: string } | null;
  impactEstimate: { estimated_tasks: number; complexity: 'simple' | 'moderate' | 'complex'; heaviest_requirements: string[]; requirement_details?: Array<{ description: string; estimated_task_count: number; test_linked: boolean; weight: number; dependents: number }> } | null;
  healthUpdate: { tasks_done: number; tasks_total: number; tests_passing: number; tests_total: number; tokens_used: number; health_score: number } | null;
  healthSummary: { health_score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; breakdown: { tasks_score: number; tests_score: number; corrections_score: number; budget_score: number } } | null;
  boundaryAnalysis: { inputs: Array<{ name: string; type: string; source?: string }>; outputs: Array<{ name: string; type: string; source?: string }>; boundary_portals: string[] } | null;
  compositionStarted: { graph_id: string; node_ids: string[] } | null;
  compositionImpacts: Array<{ graph_id: string; changed_node_id: string; affected_nodes: Array<{ node_id: string; label: string; reason: string }>; severity: string }>;
  healthHistory: HealthHistoryEntry[];
  agentOutputs: Record<string, string[]>;
}

const INITIAL_TOKEN_USAGE: TokenUsage = { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500_000, perAgent: {} };

export const initialState: BuildSessionState = {
  uiState: 'design',
  tasks: [],
  agents: [],
  commits: [],
  events: [],
  sessionId: null,
  teachingMoments: [],
  testResults: [],
  coveragePct: null,
  tokenUsage: INITIAL_TOKEN_USAGE,
  serialLines: [],
  deployProgress: null,
  deployChecklist: null,
  deployUrls: {},
  gateRequest: null,
  questionRequest: null,
  nuggetDir: null,
  errorNotification: null,
  narratorMessages: [],
  isPlanning: false,
  flashWizardState: null,
  documentationPath: null,
  contextFlows: [],
  traceability: null,
  correctionCycles: {},
  decomposition: null,
  impactEstimate: null,
  healthUpdate: null,
  healthSummary: null,
  boundaryAnalysis: null,
  compositionStarted: null,
  compositionImpacts: [],
  healthHistory: [],
  agentOutputs: {},
};

// -- Actions --

export type BuildSessionAction =
  | { type: 'WS_EVENT'; event: WSEvent; deploySteps: Array<{ id: string; name: string; method: string }> }
  | { type: 'SET_UI_STATE'; uiState: UIState }
  | { type: 'SET_SESSION_ID'; sessionId: string }
  | { type: 'SET_ERROR'; message: string; recoverable: boolean }
  | { type: 'CLEAR_GATE_REQUEST' }
  | { type: 'CLEAR_QUESTION_REQUEST' }
  | { type: 'CLEAR_ERROR_NOTIFICATION' }
  | { type: 'RESET_FOR_BUILD' }
  | { type: 'RESET_TO_DESIGN' }
  | { type: 'STOP_BUILD' };

// -- Helpers for task updates --

function updateTasks(tasks: Task[], taskId: string, status: Task['status']): Task[] {
  return tasks.map(t => t.id === taskId ? { ...t, status } : t);
}

function updateTasksMulti(tasks: Task[], predicate: (t: Task) => boolean, status: Task['status']): Task[] {
  return tasks.map(t => predicate(t) ? { ...t, status } : t);
}

function updateAgents(agents: Agent[], agentName: string, status: Agent['status']): Agent[] {
  return agents.map(a => a.name === agentName ? { ...a, status } : a);
}

function appendEvent(events: WSEvent[], event: WSEvent): WSEvent[] {
  const next = [...events, event];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

// -- Reducer --

function handleWSEvent(state: BuildSessionState, event: WSEvent, deploySteps: Array<{ id: string; name: string; method: string }>): BuildSessionState {
  const events = appendEvent(state.events, event);

  switch (event.type) {
    case 'planning_started':
      return { ...state, events, isPlanning: true };

    case 'plan_ready': {
      const planTasks: Task[] = [...event.tasks];
      const lastTaskId = planTasks.length > 0 ? planTasks[planTasks.length - 1].id : undefined;
      const deployTarget = event.deployment_target ?? '';
      const steps = event.deploy_steps;

      if (steps && steps.length > 0) {
        for (const step of steps) {
          const label = step.method === 'cloud' ? `Deploy ${step.name}` : `Flash ${step.name}`;
          planTasks.push({
            id: `__deploy_${step.id}__`,
            name: label,
            description: `${label} via ${step.method}`,
            status: 'pending',
            agent_name: '',
            dependencies: lastTaskId ? [lastTaskId] : [],
          });
        }
        const hasCloud = steps.some(s => s.method === 'cloud');
        if (deployTarget === 'both' && !hasCloud) {
          planTasks.push({
            id: '__deploy_web__',
            name: 'Web Preview',
            description: 'Start local web preview server',
            status: 'pending',
            agent_name: '',
            dependencies: lastTaskId ? [lastTaskId] : [],
          });
        }
      } else if (deployTarget === 'esp32' || deployTarget === 'both') {
        planTasks.push({
          id: '__deploy__',
          name: 'Flash to Board',
          description: 'Flash MicroPython code to ESP32 via mpremote',
          status: 'pending',
          agent_name: '',
          dependencies: lastTaskId ? [lastTaskId] : [],
        });
      }
      return { ...state, events, isPlanning: false, tasks: planTasks, agents: event.agents };
    }

    case 'task_started':
      return {
        ...state,
        events,
        tasks: updateTasks(state.tasks, event.task_id, 'in_progress'),
        agents: updateAgents(state.agents, event.agent_name, 'working'),
      };

    case 'task_completed': {
      const completedTask = state.tasks.find(t => t.id === event.task_id);
      return {
        ...state,
        events,
        tasks: updateTasks(state.tasks, event.task_id, 'done'),
        agents: completedTask
          ? updateAgents(state.agents, completedTask.agent_name, 'idle')
          : state.agents,
      };
    }

    case 'task_failed': {
      const failedTask = state.tasks.find(t => t.id === event.task_id);
      return {
        ...state,
        events,
        tasks: updateTasks(state.tasks, event.task_id, 'failed'),
        agents: failedTask
          ? updateAgents(state.agents, failedTask.agent_name, 'error')
          : state.agents,
      };
    }

    case 'agent_output': {
      const taskOutputs = state.agentOutputs[event.task_id] ?? [];
      return {
        ...state,
        events,
        agentOutputs: {
          ...state.agentOutputs,
          [event.task_id]: [...taskOutputs, event.content],
        },
      };
    }

    case 'agent_status':
      return {
        ...state,
        events,
        agents: state.agents.map(a =>
          a.name === event.agent.name ? { ...event.agent } : a
        ),
      };

    case 'agent_message':
      return { ...state, events };

    case 'commit_created':
      return {
        ...state,
        events,
        commits: [...state.commits, {
          sha: event.sha,
          message: event.message,
          agent_name: event.agent_name,
          task_id: event.task_id,
          timestamp: event.timestamp,
          files_changed: event.files_changed,
        }],
      };

    case 'deploy_started': {
      const deployNodeId = `__deploy_${event.target}__`;
      return {
        ...state,
        events,
        uiState: 'building',
        deployProgress: { step: 'Starting deployment...', progress: 0 },
        tasks: updateTasksMulti(
          state.tasks,
          t => t.id === deployNodeId || t.id === '__deploy__',
          'in_progress',
        ),
      };
    }

    case 'deploy_progress':
      return { ...state, events, deployProgress: { step: event.step, progress: event.progress } };

    case 'deploy_checklist':
      return { ...state, events, deployChecklist: event.rules };

    case 'deploy_complete': {
      const completeNodeId = `__deploy_${event.target}__`;
      return {
        ...state,
        events,
        deployProgress: null,
        deployChecklist: null,
        deployUrls: event.url
          ? { ...state.deployUrls, [event.target]: event.url }
          : state.deployUrls,
        tasks: updateTasksMulti(
          state.tasks,
          t => t.id === completeNodeId || t.id === '__deploy__',
          'done',
        ),
      };
    }

    case 'serial_data': {
      const nextLines = [...state.serialLines, { line: event.line, timestamp: event.timestamp }];
      return {
        ...state,
        events,
        serialLines: nextLines.length > MAX_SERIAL_LINES
          ? nextLines.slice(nextLines.length - MAX_SERIAL_LINES)
          : nextLines,
      };
    }

    case 'human_gate':
      return {
        ...state,
        events,
        uiState: 'review',
        gateRequest: { task_id: event.task_id, question: event.question, context: event.context },
      };

    case 'user_question':
      return {
        ...state,
        events,
        questionRequest: { task_id: event.task_id, questions: event.questions },
      };

    case 'session_complete':
      return {
        ...state,
        events,
        uiState: 'done',
        agents: state.agents.map(a => ({ ...a, status: 'done' as const })),
      };

    case 'teaching_moment':
      return {
        ...state,
        events,
        teachingMoments: [...state.teachingMoments, {
          concept: event.concept,
          headline: event.headline,
          explanation: event.explanation,
          tell_me_more: event.tell_me_more,
          related_concepts: event.related_concepts,
        }],
      };

    case 'test_result':
      return {
        ...state,
        events,
        testResults: [...state.testResults, {
          test_name: event.test_name,
          passed: event.passed,
          details: event.details,
        }],
      };

    case 'coverage_update':
      return { ...state, events, coveragePct: event.percentage };

    case 'token_usage': {
      const prev = state.tokenUsage;
      const newInput = prev.input + event.input_tokens;
      const newOutput = prev.output + event.output_tokens;
      const newCost = prev.costUsd + (event.cost_usd ?? 0);
      const agentPrev = prev.perAgent[event.agent_name] || { input: 0, output: 0 };
      return {
        ...state,
        events,
        tokenUsage: {
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
        },
      };
    }

    case 'budget_warning':
      return {
        ...state,
        events,
        errorNotification: {
          message: `Token budget warning: ${Math.round((event.total_tokens / event.max_budget) * 100)}% used ($${event.cost_usd.toFixed(2)})`,
          recoverable: true,
          timestamp: Date.now(),
        },
      };

    case 'skill_started':
    case 'skill_step':
    case 'skill_output':
    case 'skill_completed':
    case 'skill_error':
      return { ...state, events };

    case 'skill_question':
      return {
        ...state,
        events,
        questionRequest: {
          task_id: event.step_id,
          questions: event.questions,
        },
      };

    case 'narrator_message':
      return {
        ...state,
        events,
        narratorMessages: [...state.narratorMessages, {
          from: event.from,
          text: event.text,
          mood: event.mood,
          related_task_id: event.related_task_id,
          timestamp: Date.now(),
        }],
      };

    case 'permission_auto_resolved':
      return { ...state, events };

    case 'minion_state_change':
      return {
        ...state,
        events,
        agents: state.agents.map(a =>
          a.name === event.agent_name ? { ...a, status: event.new_status as Agent['status'] } : a
        ),
      };

    case 'flash_prompt': {
      const stepInfo = deploySteps.find(s => s.id === event.device_role);
      const flashNodeId = `__deploy_${event.device_role}__`;
      return {
        ...state,
        events,
        flashWizardState: {
          visible: true,
          deviceRole: event.device_role,
          message: event.message,
          isFlashing: false,
          progress: 0,
          deviceName: stepInfo?.name,
          flashMethod: stepInfo?.method,
        },
        tasks: updateTasks(state.tasks, flashNodeId, 'in_progress'),
      };
    }

    case 'flash_progress':
      return {
        ...state,
        events,
        flashWizardState: state.flashWizardState ? {
          ...state.flashWizardState,
          isFlashing: true,
          progress: event.progress,
        } : state.flashWizardState,
      };

    case 'flash_complete': {
      const flashDoneId = `__deploy_${event.device_role}__`;
      const flashStatus = event.success ? 'done' as const : 'failed' as const;
      return {
        ...state,
        events,
        flashWizardState: state.flashWizardState ? {
          ...state.flashWizardState,
          isFlashing: false,
          progress: 100,
          visible: false,
        } : state.flashWizardState,
        tasks: updateTasks(state.tasks, flashDoneId, flashStatus),
      };
    }

    case 'context_flow':
      return {
        ...state,
        events,
        contextFlows: [...state.contextFlows, {
          from_task_id: event.from_task_id,
          to_task_ids: event.to_task_ids,
          summary_preview: event.summary_preview,
          timestamp: Date.now(),
        }],
      };

    case 'documentation_ready':
      return { ...state, events, documentationPath: event.file_path };

    case 'traceability_update': {
      if (!state.traceability) return { ...state, events };
      const updatedReqs = state.traceability.requirements.map(r =>
        r.requirement_id === event.requirement_id
          ? { ...r, status: event.status }
          : r
      );
      const passingCount = updatedReqs.filter(r => r.status === 'passing').length;
      const newCoverage = updatedReqs.length > 0
        ? Math.round((passingCount / updatedReqs.length) * 100)
        : 0;
      return {
        ...state,
        events,
        traceability: {
          coverage: newCoverage,
          requirements: updatedReqs,
        },
      };
    }

    case 'traceability_summary':
      return {
        ...state,
        events,
        traceability: {
          coverage: event.coverage,
          requirements: event.requirements,
        },
      };

    case 'correction_cycle_started': {
      const existingCycle = state.correctionCycles[event.task_id];
      return {
        ...state,
        events,
        correctionCycles: {
          ...state.correctionCycles,
          [event.task_id]: {
            task_id: event.task_id,
            attempt_number: event.attempt_number,
            max_attempts: event.max_attempts,
            step: 'diagnosing',
            failure_reason: event.failure_reason,
            converged: false,
            attempts: existingCycle?.attempts ?? [],
            tests_passing: existingCycle?.tests_passing,
            tests_total: existingCycle?.tests_total,
          },
        },
      };
    }

    case 'correction_cycle_progress': {
      const cycle = state.correctionCycles[event.task_id];
      if (!cycle) return { ...state, events };
      return {
        ...state,
        events,
        correctionCycles: {
          ...state.correctionCycles,
          [event.task_id]: {
            ...cycle,
            step: event.step,
            attempt_number: event.attempt_number,
          },
        },
      };
    }

    case 'convergence_update': {
      const prevCycle = state.correctionCycles[event.task_id];
      return {
        ...state,
        events,
        correctionCycles: {
          ...state.correctionCycles,
          [event.task_id]: {
            task_id: event.task_id,
            attempt_number: event.attempts_so_far - 1,
            max_attempts: prevCycle?.max_attempts ?? 3,
            step: prevCycle?.step,
            failure_reason: prevCycle?.failure_reason,
            trend: event.trend,
            converged: event.converged,
            attempts: event.attempts,
            tests_passing: event.tests_passing,
            tests_total: event.tests_total,
          },
        },
      };
    }

    case 'decomposition_narrated':
      return {
        ...state,
        events,
        decomposition: {
          goal: event.goal,
          subtasks: event.subtasks,
          explanation: event.explanation,
        },
      };

    case 'impact_estimate':
      return {
        ...state,
        events,
        impactEstimate: {
          estimated_tasks: event.estimated_tasks,
          complexity: event.complexity,
          heaviest_requirements: event.heaviest_requirements,
          requirement_details: event.requirement_details,
        },
      };

    case 'system_health_update':
      return {
        ...state,
        events,
        healthUpdate: {
          tasks_done: event.tasks_done,
          tasks_total: event.tasks_total,
          tests_passing: event.tests_passing,
          tests_total: event.tests_total,
          tokens_used: event.tokens_used,
          health_score: event.health_score,
        },
      };

    case 'system_health_summary':
      return {
        ...state,
        events,
        healthSummary: {
          health_score: event.health_score,
          grade: event.grade,
          breakdown: event.breakdown,
        },
      };

    case 'boundary_analysis':
      return {
        ...state,
        events,
        boundaryAnalysis: {
          inputs: event.inputs,
          outputs: event.outputs,
          boundary_portals: event.boundary_portals,
        },
      };

    case 'composition_started':
      return {
        ...state,
        events,
        compositionStarted: { graph_id: event.graph_id, node_ids: event.node_ids },
        compositionImpacts: [],
      };

    case 'composition_impact':
      return {
        ...state,
        events,
        compositionImpacts: [...state.compositionImpacts, {
          graph_id: event.graph_id,
          changed_node_id: event.changed_node_id,
          affected_nodes: event.affected_nodes,
          severity: event.severity,
        }],
      };

    case 'health_history':
      return {
        ...state,
        events,
        healthHistory: event.entries,
      };

    case 'workspace_created':
      return { ...state, events, nuggetDir: event.nugget_dir };

    case 'error': {
      let errorMsg = event.message;
      if (/auth|api.key|401|invalid.*key|invalid.*x-api-key/i.test(errorMsg) && !/deploy|gcloud|cloud.run/i.test(errorMsg)) {
        errorMsg = 'Elisa can\'t connect to her AI brain. Ask your parent to check the API key!';
      }
      const isDeployError = event.message.includes('flash') || event.message.includes('mpremote') ||
        event.message.includes('Compilation failed') || event.message.includes('board detected');
      return {
        ...state,
        events,
        errorNotification: {
          message: errorMsg,
          recoverable: event.recoverable,
          timestamp: Date.now(),
        },
        tasks: isDeployError
          ? updateTasksMulti(state.tasks, t => t.id.startsWith('__deploy') && t.status === 'in_progress', 'failed')
          : state.tasks,
      };
    }

    default:
      return { ...state, events };
  }
}

export function buildSessionReducer(state: BuildSessionState, action: BuildSessionAction): BuildSessionState {
  switch (action.type) {
    case 'WS_EVENT':
      return handleWSEvent(state, action.event, action.deploySteps);

    case 'SET_UI_STATE':
      return { ...state, uiState: action.uiState };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.sessionId };

    case 'SET_ERROR':
      return {
        ...state,
        errorNotification: { message: action.message, recoverable: action.recoverable, timestamp: Date.now() },
      };

    case 'CLEAR_GATE_REQUEST':
      return { ...state, gateRequest: null };

    case 'CLEAR_QUESTION_REQUEST':
      return { ...state, questionRequest: null };

    case 'CLEAR_ERROR_NOTIFICATION':
      return { ...state, errorNotification: null };

    case 'RESET_FOR_BUILD':
      return {
        ...initialState,
        uiState: 'building',
        sessionId: state.sessionId,
      };

    case 'RESET_TO_DESIGN':
      return { ...initialState };

    case 'STOP_BUILD':
      return {
        ...state,
        uiState: 'done',
        agents: state.agents.map(a => ({ ...a, status: 'done' as const })),
      };

    default:
      return state;
  }
}

export function useBuildSession() {
  const [state, dispatch] = useReducer(buildSessionReducer, initialState);
  const deployStepsRef = useRef<Array<{ id: string; name: string; method: string }>>([]);

  const handleEvent = useCallback((event: WSEvent) => {
    // Track deploy steps from plan_ready for flash_prompt lookup
    if (event.type === 'plan_ready' && event.deploy_steps && event.deploy_steps.length > 0) {
      deployStepsRef.current = event.deploy_steps;
    }
    dispatch({ type: 'WS_EVENT', event, deploySteps: deployStepsRef.current });
  }, []);

  const startBuild = useCallback(async (
    spec: NuggetSpec,
    waitForWs?: () => Promise<void>,
    workspacePath?: string,
    workspaceJson?: Record<string, unknown>,
  ) => {
    dispatch({ type: 'RESET_FOR_BUILD' });
    deployStepsRef.current = [];

    const res = await authFetch('/api/sessions', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      let message = body.detail || 'Elisa couldn\'t get ready to build. Try again!';
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        const fieldErrors = body.errors.map((e: { path: string; message: string }) =>
          e.path ? `${e.path}: ${e.message}` : e.message
        );
        message += '\n' + fieldErrors.join('\n');
      }
      dispatch({ type: 'SET_UI_STATE', uiState: 'design' });
      dispatch({ type: 'SET_ERROR', message, recoverable: true });
      return;
    }
    const { session_id } = await res.json();
    dispatch({ type: 'SET_SESSION_ID', sessionId: session_id });

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
      dispatch({ type: 'SET_UI_STATE', uiState: 'design' });
      dispatch({ type: 'SET_ERROR', message, recoverable: true });
    }
  }, []);

  const clearGateRequest = useCallback(() => {
    dispatch({ type: 'CLEAR_GATE_REQUEST' });
  }, []);

  const clearQuestionRequest = useCallback(() => {
    dispatch({ type: 'CLEAR_QUESTION_REQUEST' });
  }, []);

  const clearErrorNotification = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR_NOTIFICATION' });
  }, []);

  const stopBuild = useCallback(async () => {
    if (!state.sessionId) return;
    await authFetch(`/api/sessions/${state.sessionId}/stop`, { method: 'POST' });
    dispatch({ type: 'STOP_BUILD' });
  }, [state.sessionId]);

  const resetToDesign = useCallback(() => {
    dispatch({ type: 'RESET_TO_DESIGN' });
    deployStepsRef.current = [];
  }, []);

  return {
    uiState: state.uiState,
    tasks: state.tasks,
    agents: state.agents,
    commits: state.commits,
    events: state.events,
    sessionId: state.sessionId,
    teachingMoments: state.teachingMoments,
    testResults: state.testResults,
    coveragePct: state.coveragePct,
    tokenUsage: state.tokenUsage,
    serialLines: state.serialLines,
    deployProgress: state.deployProgress,
    deployChecklist: state.deployChecklist,
    deployUrls: state.deployUrls,
    gateRequest: state.gateRequest,
    questionRequest: state.questionRequest,
    nuggetDir: state.nuggetDir,
    errorNotification: state.errorNotification,
    narratorMessages: state.narratorMessages,
    isPlanning: state.isPlanning,
    flashWizardState: state.flashWizardState,
    documentationPath: state.documentationPath,
    contextFlows: state.contextFlows,
    traceability: state.traceability,
    correctionCycles: state.correctionCycles,
    decomposition: state.decomposition,
    impactEstimate: state.impactEstimate,
    healthUpdate: state.healthUpdate,
    healthSummary: state.healthSummary,
    boundaryAnalysis: state.boundaryAnalysis,
    compositionStarted: state.compositionStarted,
    compositionImpacts: state.compositionImpacts,
    healthHistory: state.healthHistory,
    agentOutputs: state.agentOutputs,
    handleEvent,
    startBuild,
    stopBuild,
    clearGateRequest,
    clearQuestionRequest,
    clearErrorNotification,
    resetToDesign,
  };
}
