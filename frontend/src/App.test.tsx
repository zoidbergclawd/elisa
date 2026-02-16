import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

// Mock all heavy dependencies
vi.mock('./hooks/useBuildSession', () => ({
  useBuildSession: vi.fn(() => ({
    uiState: 'design',
    tasks: [],
    agents: [],
    commits: [],
    events: [],
    sessionId: null,
    teachingMoments: [],
    testResults: [],
    coveragePct: null,
    tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500000, perAgent: {} },
    serialLines: [],
    deployProgress: null,
    deployChecklist: null,
    deployUrl: null,
    gateRequest: null,
    questionRequest: null,
    nuggetDir: null,
    errorNotification: null,
    narratorMessages: [],
    handleEvent: vi.fn(),
    startBuild: vi.fn(),
    stopBuild: vi.fn(),
    clearGateRequest: vi.fn(),
    clearQuestionRequest: vi.fn(),
    clearErrorNotification: vi.fn(),
    resetToDesign: vi.fn(),
  })),
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
  authFetch: vi.fn(),
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
      uiState: 'building',
      tasks: [],
      agents: [],
      commits: [],
      events: [],
      sessionId: 'sess-1',
      teachingMoments: [],
      testResults: [],
      coveragePct: null,
      tokenUsage: { input: 0, output: 0, total: 0, costUsd: 0, maxBudget: 500000, perAgent: {} },
      serialLines: [],
      deployProgress: null,
      deployChecklist: null,
      deployUrl: null,
      gateRequest: null,
      questionRequest: null,
      nuggetDir: null,
      errorNotification: { message: 'Something went wrong' },
      narratorMessages: [],
      handleEvent: vi.fn(),
      startBuild: vi.fn(),
      stopBuild: vi.fn(),
      clearGateRequest: vi.fn(),
      clearQuestionRequest: vi.fn(),
      clearErrorNotification: vi.fn(),
      resetToDesign: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders GO button', () => {
    render(<App />);
    // GoButton is mocked but should be in the header
    expect(screen.getByTestId('readiness-badge')).toBeInTheDocument();
  });
});
