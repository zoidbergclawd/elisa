import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useBuildSession } from '../hooks/useBuildSession';
import type {
  SerialLine,
  DeployProgress,
  GateRequest,
  QuestionRequest,
  ErrorNotification,
  FlashWizardState,
  ContextFlow,
} from '../hooks/useBuildSession';
import type {
  UIState,
  Task,
  Agent,
  Commit,
  WSEvent,
  TeachingMoment,
  TestResult,
  TokenUsage,
  NarratorMessage,
  TraceabilitySummary,
  CorrectionCycleState,
  HealthHistoryEntry,
} from '../types';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';

export interface BuildSessionContextValue {
  // State
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
  contextFlows: ContextFlow[];
  traceability: TraceabilitySummary | null;
  correctionCycles: Record<string, CorrectionCycleState>;
  impactEstimate: {
    estimated_tasks: number;
    complexity: 'simple' | 'moderate' | 'complex';
    heaviest_requirements: string[];
    requirement_details?: Array<{
      description: string;
      estimated_task_count: number;
      test_linked: boolean;
      weight: number;
      dependents: number;
    }>;
  } | null;
  healthUpdate: {
    tasks_done: number;
    tasks_total: number;
    tests_passing: number;
    tests_total: number;
    tokens_used: number;
    health_score: number;
  } | null;
  healthSummary: {
    health_score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: {
      tasks_score: number;
      tests_score: number;
      corrections_score: number;
      budget_score: number;
    };
  } | null;
  healthHistory: HealthHistoryEntry[];
  boundaryAnalysis: {
    inputs: Array<{ name: string; type: string; source?: string }>;
    outputs: Array<{ name: string; type: string; source?: string }>;
    boundary_portals: string[];
  } | null;

  // Actions
  handleEvent: (event: WSEvent) => void;
  startBuild: (
    spec: NuggetSpec,
    waitForWs?: () => Promise<void>,
    workspacePath?: string,
    workspaceJson?: Record<string, unknown>,
  ) => Promise<void>;
  stopBuild: () => Promise<void>;
  clearGateRequest: () => void;
  clearQuestionRequest: () => void;
  clearErrorNotification: () => void;
  resetToDesign: () => void;
}

const BuildSessionContext = createContext<BuildSessionContextValue | null>(null);

export function BuildSessionProvider({ children }: { children: ReactNode }) {
  const session = useBuildSession();

  return (
    <BuildSessionContext.Provider value={session}>
      {children}
    </BuildSessionContext.Provider>
  );
}

export function useBuildSessionContext(): BuildSessionContextValue {
  const ctx = useContext(BuildSessionContext);
  if (!ctx) {
    throw new Error('useBuildSessionContext must be used within a BuildSessionProvider');
  }
  return ctx;
}
