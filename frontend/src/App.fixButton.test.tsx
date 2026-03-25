import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';

// Shared mock state for useBuildSession
const buildSessionDefaults = {
  uiState: 'done' as const,
  tasks: [],
  agents: [],
  commits: [],
  events: [{ type: 'session_complete' as const, summary: 'Done!' }],
  sessionId: 'sess-1',
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
  errorNotification: null,
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

// Meeting session mock with controllable activeMeeting
function makeMeetingState(overrides: Record<string, unknown> = {}) {
  return {
    inviteQueue: [],
    nextInvite: null,
    activeMeeting: null as null | {
      meetingId: string;
      meetingTypeId: string;
      agentName: string;
      canvasType: string;
      canvasState: { type: string; data: Record<string, unknown> };
      messages: Array<{ role: 'agent' | 'kid'; content: string }>;
      outcomes: Array<{ type: string; data: Record<string, unknown> }>;
    },
    isAgentThinking: false,
    messages: [] as Array<{ role: 'agent' | 'kid'; content: string }>,
    canvasState: { type: '', data: {} },
    handleMeetingEvent: vi.fn(() => false),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    dismissToast: vi.fn(),
    startDirectMeeting: vi.fn(),
    sendMessage: vi.fn(),
    endMeeting: vi.fn(),
    updateCanvas: vi.fn(),
    materializeArtifacts: vi.fn(),
    requestFix: vi.fn().mockResolvedValue(undefined),
    resetMeetings: vi.fn(),
    clearAllInvites: vi.fn(),
    ...overrides,
  };
}

vi.mock('./hooks/useMeetingSession', () => ({
  useMeetingSession: vi.fn(() => makeMeetingState()),
}));

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ waitForOpen: vi.fn() })),
}));

vi.mock('./hooks/useHealthCheck', () => ({
  useHealthCheck: vi.fn(() => ({ health: { status: 'ready' }, loading: false })),
}));

vi.mock('./hooks/useBoardDetect', () => ({
  useBoardDetect: vi.fn(() => ({ boardInfo: null, justConnected: false, acknowledgeConnection: vi.fn() })),
}));

vi.mock('./components/BlockCanvas/BlockCanvas', () => ({
  default: vi.fn(() => <div data-testid="block-canvas">BlockCanvas</div>),
}));

vi.mock('./components/BlockCanvas/blockInterpreter', () => ({
  interpretWorkspace: vi.fn(),
  migrateWorkspace: vi.fn(),
}));

vi.mock('./components/BottomBar/BottomBar', () => ({
  default: vi.fn(() => <div>BottomBar</div>),
}));

vi.mock('./components/MissionControl/MissionControlPanel', () => ({
  default: vi.fn(() => <div>MissionControl</div>),
}));

vi.mock('./components/shared/TeachingToast', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/shared/ReadinessBadge', () => ({ default: vi.fn(() => <div>Ready</div>) }));
vi.mock('./components/BlockCanvas/WorkspaceSidebar', () => ({ default: vi.fn(() => <div>Sidebar</div>) }));
vi.mock('./components/shared/MeetingInviteToast', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/Meeting/MeetingModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/TeamPanel/TeamPanel', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/SystemPanel/SystemPanel', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/TestPanel/TestPanel', () => ({ default: vi.fn(() => null) }));

vi.mock('./lib/nuggetFile', () => ({ saveNuggetFile: vi.fn(), loadNuggetFile: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('./lib/apiClient', () => ({ setAuthToken: vi.fn(), authFetch: vi.fn(() => Promise.resolve({ ok: false })) }));
vi.mock('./lib/deviceBlocks', () => ({ registerDeviceBlocks: vi.fn() }));
vi.mock('./lib/playChime', () => ({ playChime: vi.fn(), playMeetingChime: vi.fn() }));
vi.mock('./lib/examples', () => ({ EXAMPLE_NUGGETS: [] }));
vi.mock('./components/Portals/portalTemplates', () => ({ portalTemplates: [] }));
vi.mock('./components/shared/GoButton', () => ({ default: vi.fn(() => <button>GO</button>) }));
vi.mock('./components/shared/HumanGateModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/shared/QuestionModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/Skills/SkillsModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/Rules/RulesModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/Portals/PortalsModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/shared/ExamplePickerModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/shared/DirectoryPickerModal', () => ({ default: vi.fn(() => null) }));
vi.mock('./components/shared/BoardDetectedModal', () => ({ default: vi.fn(() => null) }));

describe('IterativeChatPanel in done state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows iterative chat panel when build is done', () => {
    render(<App />);
    // The panel should render its chat prompt
    expect(screen.getByText(/Tell me what you'd like to change/i)).toBeInTheDocument();
  });

  it('shows Fix It button when tests are failing', async () => {
    const { useBuildSession } = await import('./hooks/useBuildSession');
    const { useMeetingSession } = await import('./hooks/useMeetingSession');
    const mockUseBuild = useBuildSession as ReturnType<typeof vi.fn>;
    const mockUseMeeting = useMeetingSession as ReturnType<typeof vi.fn>;

    const handleEvent = vi.fn();
    mockUseBuild.mockReturnValue({
      ...buildSessionDefaults,
      handleEvent,
      testResults: [{ test_name: 'test1', passed: false, details: 'fail' }],
    });

    const mockStart = vi.fn().mockRejectedValue(new Error('Session not found'));
    mockUseMeeting.mockReturnValue(makeMeetingState({ startDirectMeeting: mockStart }));

    render(<App />);

    const fixButton = screen.getByText(/Fix It/);
    await act(async () => { fireEvent.click(fixButton); });

    expect(handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'Session expired. Please build again.' }),
    );
  });

  it('shows Fix in progress indicator when isFixing is true', async () => {
    const { useBuildSession } = await import('./hooks/useBuildSession');
    const mockUseBuild = useBuildSession as ReturnType<typeof vi.fn>;

    mockUseBuild.mockReturnValue({
      ...buildSessionDefaults,
      isFixing: true,
    });

    render(<App />);
    expect(screen.getByText('Fix in progress...')).toBeInTheDocument();
  });

  it('shows chat input that can send messages', () => {
    render(<App />);
    const input = screen.getByLabelText('Chat message input');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it('shows test pass count when tests exist', async () => {
    const { useBuildSession } = await import('./hooks/useBuildSession');
    const mockUseBuild = useBuildSession as ReturnType<typeof vi.fn>;

    mockUseBuild.mockReturnValue({
      ...buildSessionDefaults,
      testResults: [
        { test_name: 'test1', passed: true, details: 'ok' },
        { test_name: 'test2', passed: false, details: 'fail' },
      ],
    });

    render(<App />);
    expect(screen.getByText('1/2 tests passing')).toBeInTheDocument();
  });
});
