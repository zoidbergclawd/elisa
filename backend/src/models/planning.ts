/** Planning Mode session types (PRD-004). */

import type {
  PlanState,
  QuestionWidget,
  TeachingAnnotation,
  CanvasBlockSpec,
  LearningSummary,
} from '../utils/planSchema.js';

export type PlanningStatus = 'idle' | 'active' | 'ready' | 'generating' | 'generated';

export interface PlanningMessage {
  role: 'agent' | 'kid';
  content: string;
  timestamp: number;
  question?: QuestionWidget;
  teaching?: TeachingAnnotation | null;
}

export interface PlanningSession {
  sessionId: string;
  status: PlanningStatus;
  plan: PlanState;
  conversationHistory: PlanningMessage[];
  currentQuestion: QuestionWidget | null;
  currentMutationMap: Record<string, Record<string, unknown> | null> | null;
  canvasContext?: CanvasContext | null;
  learningSummary?: LearningSummary | null;
  generatedBlocks?: CanvasBlockSpec | null;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasContext {
  blocks: Array<{
    type: string;
    content: string;
    subtype?: string;
    children?: Array<{ type: string; content: string }>;
  }>;
  hasGoal: boolean;
  promiseCount: number;
  skillCount: number;
  portalCount: number;
  hasDeployTarget: boolean;
}

/** Creates an empty plan state for a new planning session. */
export function createEmptyPlan(idea: string): PlanState {
  return {
    idea,
    goal: { description: null, confidence: 'vague' },
    promises: [],
    skills: [],
    portals: [],
    deploy: { target: null, constraints: [] },
    open_questions: [],
    ready: false,
    conversation_turn: 0,
  };
}
