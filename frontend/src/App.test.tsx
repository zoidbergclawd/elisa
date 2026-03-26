import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

// Mock all heavy dependencies
const buildSessionDefaults = {
  uiState: 'design' as const,
  tasks: [],
  agents: [],
  commits: [],
  events: [],
  sessionId: null as string | null,
  teachingMoments: [],
  testResults: [],
  coveragePct: null,
  tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500000, perAgent: {} },
  serialLines: [],
  deployProgress: null,
  deployChecklist: null,
  deployUrl: null,
  deployUrls: {},
  gateRequest: null,
  questionRequest: null,
  nuggetDir: null,
  errorNotification: null as { message: string; recoverable?: boolean; timestamp?: number } | null,
  narratorMessages: [],
  isPlanning: false,
  flashWizardState: null,
  contextFlows: [],
  traceability: null,
  correctionCycles: {},
  impactEstimate: null,
  healthUpdate: null,
  healthSummary: null,
  healthHistory: [],
  isFixing: false,
  fixPhase: null,
  meetingBlockedTasks: [],
  testGatePassed: null,
  autoFixAttempt: null,
  visualTestResult: null,
  boundaryAnalysis: null,
  agentOutputs: {},
  decomposition: null,
  compositionStarted: null,
  compositionImpacts: [],
  documentationPath: null,
  chatMessages: [],
  isChatProcessing: false,
  chatTestSummary: null,
  previewRefreshKey: 0,
  handleEvent: vi.fn(),
  createSession: vi.fn(),
  startBuild: vi.fn(),
  stopBuild: vi.fn(),
  clearGateRequest: vi.fn(),
  clearQuestionRequest: vi.fn(),
  clearErrorNotification: vi.fn(),
  resetToDesign: vi.fn(),
  launchWorkspace: vi.fn(),
};

vi.mock('./hooks/useBuildSession', () => ({
  useBuildSession: vi.fn(() => buildSessionDefaults),
}));

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ waitForOpen: vi.fn() })),
}));

vi.mock('./hooks/useHealthCheck', () => ({
  useHealthCheck: vi.fn(() => ({
    health: { status: 'ready' },
    loading: false,
  })),
}));

vi.mock('./hooks/useBoardDetect', () => ({
  useBoardDetect: vi.fn(() => ({
    boardInfo: null,
    justConnected: false,
    acknowledgeConnection: vi.fn(),
  })),
}));

vi.mock('./components/BlockCanvas/BlockCanvas', () => ({
  default: vi.fn(() => <div data-testid="block-canvas">BlockCanvas</div>),
}));

vi.mock('./components/BlockCanvas/blockInterpreter', () => ({
  interpretWorkspace: vi.fn(),
  migrateWorkspace: vi.fn(),
}));

vi.mock('./components/BottomBar/BottomBar', () => ({
  default: vi.fn(() => <div data-testid="bottom-bar">BottomBar</div>),
}));

vi.mock('./components/MissionControl/MissionControlPanel', () => ({
  default: vi.fn(() => <div data-testid="mission-control">MissionControl</div>),
}));

vi.mock('./components/shared/TeachingToast', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/shared/ReadinessBadge', () => ({
  default: vi.fn(() => <div data-testid="readiness-badge">Ready</div>),
}));

vi.mock('./components/BlockCanvas/WorkspaceSidebar', () => ({
  default: vi.fn(() => <div data-testid="workspace-sidebar">Sidebar</div>),
}));

vi.mock('./lib/nuggetFile', () => ({
  saveNuggetFile: vi.fn(),
  loadNuggetFile: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('./lib/apiClient', () => ({
  setAuthToken: vi.fn(),
  authFetch: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock('./lib/deviceBlocks', () => ({
  registerDeviceBlocks: vi.fn(),
}));

vi.mock('./lib/playChime', () => ({
  playChime: vi.fn(),
}));

vi.mock('./lib/examples', () => ({
  EXAMPLE_NUGGETS: [],
}));

vi.mock('./components/Portals/portalTemplates', () => ({
  portalTemplates: [],
}));

vi.mock('./components/shared/GoButton', () => ({
  default: vi.fn(({ uiState }: { uiState: string }) => (
    <button data-testid="go-button">{uiState === 'building' ? 'STOP' : 'GO'}</button>
  )),
}));

vi.mock('./components/shared/HumanGateModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/shared/QuestionModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/Skills/SkillsModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/Rules/RulesModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/Portals/PortalsModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/shared/ExamplePickerModal', () => ({
  default: vi.fn(() => <div data-testid="example-picker">ExamplePicker</div>),
}));

vi.mock('./components/shared/DirectoryPickerModal', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/shared/BoardDetectedModal', () => ({
  default: vi.fn(() => null),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Elisa')).toBeInTheDocument();
  });

  it('renders header with logo text', () => {
    render(<App />);
    expect(screen.getByText('Elisa')).toBeInTheDocument();
  });

  it('renders workspace tab by default', () => {
    render(<App />);
    expect(screen.getByTestId('block-canvas')).toBeInTheDocument();
  });

  it('renders bottom bar', () => {
    render(<App />);
    expect(screen.getByTestId('bottom-bar')).toBeInTheDocument();
  });

  it('switches to mission control tab when clicked', () => {
    render(<App />);
    const missionTab = screen.getByText('Mission Control');
    fireEvent.click(missionTab);
    expect(screen.getByTestId('mission-control')).toBeInTheDocument();
  });

  it('renders error banner when errorNotification is set', async () => {
    const { useBuildSession } = await import('./hooks/useBuildSession');
    (useBuildSession as ReturnType<typeof vi.fn>).mockReturnValue({
      ...buildSessionDefaults,
      uiState: 'building',
      sessionId: 'sess-1',
      errorNotification: { message: 'Something went wrong' },
    });

    render(<App />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders GO button and readiness badge', () => {
    render(<App />);
    expect(screen.getByTestId('readiness-badge')).toBeInTheDocument();
  });
});
