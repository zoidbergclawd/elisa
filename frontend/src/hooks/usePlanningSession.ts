/** Planning session state hook -- manages Planning Mode conversation and plan state via useReducer. */

import { useReducer, useCallback } from 'react';
import type {
  WSEvent,
  PlanState,
  PlanningStatus,
  PlanningMessage,
  QuestionWidget,
  TeachingAnnotation,
  CanvasBlockSpec,
} from '../types';
import { authFetch } from '../lib/apiClient';

// -- State --

export interface PlanningSessionState {
  status: PlanningStatus;
  plan: PlanState;
  conversationHistory: PlanningMessage[];
  currentQuestion: QuestionWidget | null;
  currentMutationMap: Record<string, Record<string, unknown> | null>;
  currentTeaching: TeachingAnnotation | null;
  canvasBlockSpec: CanvasBlockSpec | null;
  isAgentThinking: boolean;
  error: string | null;
}

const emptyPlan: PlanState = {
  idea: '',
  goal: { description: null, confidence: 'vague' },
  promises: [],
  skills: [],
  portals: [],
  deploy: { target: null, constraints: [] },
  open_questions: [],
  ready: false,
  conversation_turn: 0,
};

export const initialState: PlanningSessionState = {
  status: 'idle',
  plan: emptyPlan,
  conversationHistory: [],
  currentQuestion: null,
  currentMutationMap: {},
  currentTeaching: null,
  canvasBlockSpec: null,
  isAgentThinking: false,
  error: null,
};

// -- Actions --

type PlanningAction =
  | { type: 'START_PLANNING' }
  | { type: 'PLANNING_TURN'; message: string; streaming: boolean }
  | { type: 'PLANNING_QUESTION'; question: QuestionWidget; mutationMap: Record<string, Record<string, unknown> | null> }
  | { type: 'PLANNING_PLAN_UPDATED'; plan: PlanState }
  | { type: 'PLANNING_READY'; plan: PlanState; summary: string }
  | { type: 'PLANNING_CANVAS_GENERATED'; blocks: CanvasBlockSpec }
  | { type: 'PLANNING_ERROR'; error: string }
  | { type: 'PLANNING_TEACHING'; teaching: TeachingAnnotation }
  | { type: 'SUBMIT_ANSWER'; value: string | string[] }
  | { type: 'SUBMIT_MESSAGE'; content: string }
  | { type: 'REQUEST_GENERATE' }
  | { type: 'RESET' };

// -- Reducer --

export function planningReducer(state: PlanningSessionState, action: PlanningAction): PlanningSessionState {
  switch (action.type) {
    case 'START_PLANNING':
      return {
        ...initialState,
        status: 'active',
        isAgentThinking: true,
      };

    case 'PLANNING_TURN':
      return {
        ...state,
        isAgentThinking: false,
        conversationHistory: [
          ...state.conversationHistory,
          { role: 'agent', content: action.message, timestamp: Date.now() },
        ],
      };

    case 'PLANNING_QUESTION':
      return {
        ...state,
        currentQuestion: action.question,
        currentMutationMap: action.mutationMap,
        isAgentThinking: false,
      };

    case 'PLANNING_PLAN_UPDATED':
      return {
        ...state,
        plan: action.plan,
      };

    case 'PLANNING_READY':
      return {
        ...state,
        status: 'ready',
        plan: action.plan,
        isAgentThinking: false,
        conversationHistory: [
          ...state.conversationHistory,
          { role: 'agent', content: action.summary, timestamp: Date.now() },
        ],
      };

    case 'PLANNING_CANVAS_GENERATED':
      return {
        ...state,
        status: 'generated',
        canvasBlockSpec: action.blocks,
        isAgentThinking: false,
      };

    case 'PLANNING_ERROR':
      return {
        ...state,
        error: action.error,
        isAgentThinking: false,
      };

    case 'PLANNING_TEACHING':
      return {
        ...state,
        currentTeaching: action.teaching,
      };

    case 'SUBMIT_ANSWER': {
      const answerText = Array.isArray(action.value)
        ? action.value.join(', ')
        : action.value;
      return {
        ...state,
        currentQuestion: null,
        currentMutationMap: {},
        isAgentThinking: true,
        conversationHistory: [
          ...state.conversationHistory,
          { role: 'kid', content: answerText, timestamp: Date.now() },
        ],
      };
    }

    case 'SUBMIT_MESSAGE':
      return {
        ...state,
        isAgentThinking: true,
        conversationHistory: [
          ...state.conversationHistory,
          { role: 'kid', content: action.content, timestamp: Date.now() },
        ],
      };

    case 'REQUEST_GENERATE':
      return {
        ...state,
        status: 'generating',
        isAgentThinking: true,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// -- Hook --

export function usePlanningSession(sessionId: string | null) {
  const [state, dispatch] = useReducer(planningReducer, initialState);

  /** Handle a WSEvent that may be planning-related. Returns true if handled. */
  const handlePlanningEvent = useCallback((event: WSEvent): boolean => {
    switch (event.type) {
      case 'planning_mode_started':
        dispatch({ type: 'START_PLANNING' });
        return true;

      case 'planning_turn':
        dispatch({ type: 'PLANNING_TURN', message: event.message, streaming: event.streaming });
        return true;

      case 'planning_question':
        dispatch({
          type: 'PLANNING_QUESTION',
          question: event.question,
          mutationMap: event.plan_mutation_map,
        });
        return true;

      case 'planning_plan_updated':
        dispatch({ type: 'PLANNING_PLAN_UPDATED', plan: event.plan });
        return true;

      case 'planning_ready':
        dispatch({ type: 'PLANNING_READY', plan: event.plan, summary: event.summary });
        return true;

      case 'planning_canvas_generated':
        dispatch({ type: 'PLANNING_CANVAS_GENERATED', blocks: event.blocks });
        return true;

      case 'planning_error':
        dispatch({ type: 'PLANNING_ERROR', error: event.error });
        return true;

      case 'planning_teaching':
        dispatch({ type: 'PLANNING_TEACHING', teaching: event.teaching });
        return true;

      default:
        return false;
    }
  }, []);

  /** Start a new planning session. Creates a backend session if needed. */
  const startPlanning = useCallback(async (
    idea: string,
    opts?: { createSession?: () => Promise<string | null>; waitForOpen?: () => Promise<void> },
  ) => {
    dispatch({ type: 'START_PLANNING' });

    let sid = sessionId;
    if (!sid && opts?.createSession) {
      sid = await opts.createSession();
      if (!sid) {
        dispatch({ type: 'PLANNING_ERROR', error: 'Failed to create session' });
        return;
      }
      if (opts.waitForOpen) {
        await opts.waitForOpen();
      }
    }
    if (!sid) {
      dispatch({ type: 'PLANNING_ERROR', error: 'No session available' });
      return;
    }

    const res = await authFetch(`/api/sessions/${sid}/planning/start`, {
      method: 'POST',
      body: JSON.stringify({ idea }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: 'Planning request failed' }));
      dispatch({ type: 'PLANNING_ERROR', error: body.detail || 'Planning request failed' });
    }
  }, [sessionId]);

  /** Submit a structured answer (instant -- applies mutation client-side). */
  const submitAnswer = useCallback(async (value: string | string[]) => {
    if (!sessionId) return;
    dispatch({ type: 'SUBMIT_ANSWER', value });
    await authFetch(`/api/sessions/${sessionId}/planning/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer: value }),
    });
  }, [sessionId]);

  /** Submit a free-text message. */
  const submitMessage = useCallback(async (content: string) => {
    if (!sessionId) return;
    dispatch({ type: 'SUBMIT_MESSAGE', content });
    await authFetch(`/api/sessions/${sessionId}/planning/message`, {
      method: 'POST',
      body: JSON.stringify({ message: content }),
    });
  }, [sessionId]);

  /** Request canvas generation from the current plan. */
  const generateCanvas = useCallback(async () => {
    if (!sessionId) return;
    dispatch({ type: 'REQUEST_GENERATE' });
    await authFetch(`/api/sessions/${sessionId}/planning/generate`, {
      method: 'POST',
    });
  }, [sessionId]);

  /** Reset the planning session state. */
  const resetPlanning = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    ...state,
    handlePlanningEvent,
    startPlanning,
    submitAnswer,
    submitMessage,
    generateCanvas,
    resetPlanning,
  };
}
