import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlanningSession, planningReducer, initialState } from './usePlanningSession';
import type { PlanState, QuestionWidget, TeachingAnnotation, CanvasBlockSpec } from '../types';

// Mock authFetch
const mockAuthFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
vi.mock('../lib/apiClient', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  getAuthToken: vi.fn().mockReturnValue('test-token'),
  authHeaders: vi.fn().mockReturnValue({}),
}));

const testPlan: PlanState = {
  idea: 'weather app',
  goal: { description: 'Build a weather app', confidence: 'rough' },
  promises: [{ description: 'Shows temp', category: 'behavior', proofs: [] }],
  skills: [{ name: 'Charts', description: 'Render charts' }],
  portals: [{ name: 'OpenWeather', subtype: 'api', description: 'Weather data' }],
  deploy: { target: 'web', constraints: [] },
  open_questions: [],
  ready: false,
  conversation_turn: 3,
};

const testQuestion: QuestionWidget = {
  text: 'What do you want to build?',
  type: 'single_select',
  options: [
    { label: 'A website', value: 'website' },
    { label: 'A game', value: 'game' },
  ],
};

const testTeaching: TeachingAnnotation = {
  why_asking: 'To understand the goal',
  primitive_connection: ['Goal'],
  pattern_spotted: null,
  what_if: null,
};

const testBlockSpec: CanvasBlockSpec = {
  blocks: [
    { id: 'b1', type: 'Goal', category: 'primitive', content: 'Weather app', position: { x: 50, y: 50 } },
  ],
};

describe('planningReducer', () => {
  it('starts with idle status', () => {
    expect(initialState.status).toBe('idle');
    expect(initialState.plan.goal.description).toBeNull();
    expect(initialState.conversationHistory).toEqual([]);
  });

  it('START_PLANNING sets active + thinking', () => {
    const result = planningReducer(initialState, { type: 'START_PLANNING' });
    expect(result.status).toBe('active');
    expect(result.isAgentThinking).toBe(true);
  });

  it('PLANNING_TURN adds agent message and stops thinking', () => {
    const active = planningReducer(initialState, { type: 'START_PLANNING' });
    const result = planningReducer(active, { type: 'PLANNING_TURN', message: 'Hello!', streaming: false });
    expect(result.isAgentThinking).toBe(false);
    expect(result.conversationHistory).toHaveLength(1);
    expect(result.conversationHistory[0].role).toBe('agent');
    expect(result.conversationHistory[0].content).toBe('Hello!');
  });

  it('PLANNING_QUESTION sets current question and mutation map', () => {
    const result = planningReducer(initialState, {
      type: 'PLANNING_QUESTION',
      question: testQuestion,
      mutationMap: { website: { 'deploy.target': 'web' } },
    });
    expect(result.currentQuestion).toEqual(testQuestion);
    expect(result.currentMutationMap).toEqual({ website: { 'deploy.target': 'web' } });
    expect(result.isAgentThinking).toBe(false);
  });

  it('PLANNING_PLAN_UPDATED updates plan', () => {
    const result = planningReducer(initialState, { type: 'PLANNING_PLAN_UPDATED', plan: testPlan });
    expect(result.plan).toEqual(testPlan);
  });

  it('PLANNING_READY sets ready status with summary message', () => {
    const result = planningReducer(initialState, {
      type: 'PLANNING_READY',
      plan: { ...testPlan, ready: true },
      summary: 'Your plan looks great!',
    });
    expect(result.status).toBe('ready');
    expect(result.plan.ready).toBe(true);
    expect(result.conversationHistory).toHaveLength(1);
    expect(result.conversationHistory[0].content).toBe('Your plan looks great!');
  });

  it('PLANNING_CANVAS_GENERATED sets generated status', () => {
    const result = planningReducer(initialState, {
      type: 'PLANNING_CANVAS_GENERATED',
      blocks: testBlockSpec,
    });
    expect(result.status).toBe('generated');
    expect(result.canvasBlockSpec).toEqual(testBlockSpec);
  });

  it('PLANNING_ERROR sets error message', () => {
    const result = planningReducer(initialState, { type: 'PLANNING_ERROR', error: 'Something broke' });
    expect(result.error).toBe('Something broke');
    expect(result.isAgentThinking).toBe(false);
  });

  it('PLANNING_TEACHING sets current teaching', () => {
    const result = planningReducer(initialState, { type: 'PLANNING_TEACHING', teaching: testTeaching });
    expect(result.currentTeaching).toEqual(testTeaching);
  });

  it('SUBMIT_ANSWER clears question, adds kid message, starts thinking', () => {
    const withQuestion = planningReducer(initialState, {
      type: 'PLANNING_QUESTION',
      question: testQuestion,
      mutationMap: {},
    });
    const result = planningReducer(withQuestion, { type: 'SUBMIT_ANSWER', value: 'website' });
    expect(result.currentQuestion).toBeNull();
    expect(result.currentMutationMap).toEqual({});
    expect(result.isAgentThinking).toBe(true);
    expect(result.conversationHistory).toHaveLength(1);
    expect(result.conversationHistory[0].role).toBe('kid');
    expect(result.conversationHistory[0].content).toBe('website');
  });

  it('SUBMIT_ANSWER with array joins values', () => {
    const result = planningReducer(initialState, { type: 'SUBMIT_ANSWER', value: ['a', 'b'] });
    expect(result.conversationHistory[0].content).toBe('a, b');
  });

  it('SUBMIT_MESSAGE adds kid message and starts thinking', () => {
    const result = planningReducer(initialState, { type: 'SUBMIT_MESSAGE', content: 'I want a game' });
    expect(result.isAgentThinking).toBe(true);
    expect(result.conversationHistory).toHaveLength(1);
    expect(result.conversationHistory[0].role).toBe('kid');
  });

  it('REQUEST_GENERATE sets generating status', () => {
    const result = planningReducer(initialState, { type: 'REQUEST_GENERATE' });
    expect(result.status).toBe('generating');
    expect(result.isAgentThinking).toBe(true);
  });

  it('RESET returns to initial state', () => {
    const modified = planningReducer(initialState, { type: 'START_PLANNING' });
    const result = planningReducer(modified, { type: 'RESET' });
    expect(result).toEqual(initialState);
  });
});

describe('usePlanningSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() => usePlanningSession('session-1'));
    expect(result.current.status).toBe('idle');
    expect(result.current.conversationHistory).toEqual([]);
    expect(result.current.currentQuestion).toBeNull();
  });

  describe('handlePlanningEvent', () => {
    it('handles planning_mode_started', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        const handled = result.current.handlePlanningEvent({
          type: 'planning_mode_started',
          sessionId: 'session-1',
        });
        expect(handled).toBe(true);
      });
      expect(result.current.status).toBe('active');
    });

    it('handles planning_turn', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_mode_started', sessionId: 's' });
      });
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_turn', message: 'Hi there!', streaming: false });
      });
      expect(result.current.conversationHistory).toHaveLength(1);
      expect(result.current.conversationHistory[0].content).toBe('Hi there!');
    });

    it('handles planning_question', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_question',
          question: testQuestion,
          plan_mutation_map: { website: { 'deploy.target': 'web' } },
        });
      });
      expect(result.current.currentQuestion).toEqual(testQuestion);
    });

    it('handles planning_plan_updated', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_plan_updated', plan: testPlan });
      });
      expect(result.current.plan).toEqual(testPlan);
    });

    it('handles planning_ready', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_ready',
          plan: { ...testPlan, ready: true },
          summary: 'Ready!',
        });
      });
      expect(result.current.status).toBe('ready');
    });

    it('handles planning_canvas_generated', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_canvas_generated',
          blocks: testBlockSpec,
        });
      });
      expect(result.current.status).toBe('generated');
      expect(result.current.canvasBlockSpec).toEqual(testBlockSpec);
    });

    it('handles planning_error', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_error', error: 'oops' });
      });
      expect(result.current.error).toBe('oops');
    });

    it('handles planning_teaching', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_teaching', teaching: testTeaching });
      });
      expect(result.current.currentTeaching).toEqual(testTeaching);
    });

    it('returns false for unrelated events', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      let handled = false;
      act(() => {
        handled = result.current.handlePlanningEvent({
          type: 'session_started',
          session_id: 's',
        });
      });
      expect(handled).toBe(false);
    });
  });

  describe('actions', () => {
    it('startPlanning calls API and dispatches', async () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      await act(async () => {
        await result.current.startPlanning('weather app');
      });
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/planning/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idea: 'weather app' }),
        }),
      );
      expect(result.current.status).toBe('active');
    });

    it('submitAnswer calls API and clears question', async () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_question',
          question: testQuestion,
          plan_mutation_map: {},
        });
      });
      await act(async () => {
        await result.current.submitAnswer('website');
      });
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/planning/answer',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ answer: 'website' }),
        }),
      );
      expect(result.current.currentQuestion).toBeNull();
    });

    it('submitMessage calls API and adds kid message', async () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      await act(async () => {
        await result.current.submitMessage('I want a chatbot');
      });
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/planning/message',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.current.conversationHistory).toHaveLength(1);
    });

    it('generateCanvas calls API and sets generating status', async () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      await act(async () => {
        await result.current.generateCanvas();
      });
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/planning/generate',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.current.status).toBe('generating');
    });

    it('resetPlanning returns to idle', () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_mode_started', sessionId: 's' });
      });
      expect(result.current.status).toBe('active');
      act(() => {
        result.current.resetPlanning();
      });
      expect(result.current.status).toBe('idle');
    });

    it('does not call API when sessionId is null', async () => {
      const { result } = renderHook(() => usePlanningSession(null));
      await act(async () => {
        await result.current.startPlanning('test');
      });
      expect(mockAuthFetch).not.toHaveBeenCalled();
    });
  });

  describe('full lifecycle', () => {
    it('flows from start to canvas generation', async () => {
      const { result } = renderHook(() => usePlanningSession('session-1'));

      // Start
      await act(async () => {
        await result.current.startPlanning('weather app');
      });
      expect(result.current.status).toBe('active');

      // Agent asks question
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_turn',
          message: 'What do you want to build?',
          streaming: false,
        });
      });
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_question',
          question: testQuestion,
          plan_mutation_map: {},
        });
      });
      expect(result.current.currentQuestion).not.toBeNull();

      // Kid answers
      await act(async () => {
        await result.current.submitAnswer('website');
      });
      expect(result.current.currentQuestion).toBeNull();

      // Plan updates
      act(() => {
        result.current.handlePlanningEvent({ type: 'planning_plan_updated', plan: testPlan });
      });

      // Plan ready
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_ready',
          plan: { ...testPlan, ready: true },
          summary: 'Ready!',
        });
      });
      expect(result.current.status).toBe('ready');

      // Generate canvas
      await act(async () => {
        await result.current.generateCanvas();
      });
      expect(result.current.status).toBe('generating');

      // Canvas arrives
      act(() => {
        result.current.handlePlanningEvent({
          type: 'planning_canvas_generated',
          blocks: testBlockSpec,
        });
      });
      expect(result.current.status).toBe('generated');
      expect(result.current.canvasBlockSpec).toEqual(testBlockSpec);
    });
  });
});
