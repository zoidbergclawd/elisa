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
  handleEvent: vi.fn(),
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
const mockRequestFix = vi.fn().mockResolvedValue(undefined);

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
    requestFix: mockRequestFix,
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

const bugMeeting = {
  meetingId: 'mtg-1',
  meetingTypeId: 'debug-convergence',
  agentName: 'Bug Detective',
  canvasType: 'bug-detective',
  canvasState: { type: 'bug-detective', data: {} },
  messages: [
    { role: 'agent' as const, content: 'What bug did you find?' },
    { role: 'kid' as const, content: 'The button does not work' },
    { role: 'agent' as const, content: 'I see the issue.' },
    { role: 'kid' as const, content: 'Also the color is wrong' },
  ],
  outcomes: [],
};

/**
 * Helper: simulates the full Bug Detective meeting lifecycle.
 * Returns the rendered component after the meeting ends and the done modal is visible.
 */
async function renderWithBugMeetingEnded(meeting = bugMeeting) {
  const { useMeetingSession } = await import('./hooks/useMeetingSession');
  const mockUseMeeting = useMeetingSession as ReturnType<typeof vi.fn>;

  // Phase 1: active Bug Detective meeting (auto-switches to Team tab)
  mockUseMeeting.mockReturnValue(makeMeetingState({
    activeMeeting: meeting,
    messages: meeting.messages,
  }));

  const result = render(<App />);

  // Phase 2: meeting ends (lastBugReport captured, but Team tab still active)
  mockUseMeeting.mockReturnValue(makeMeetingState());
  await act(async () => { result.rerender(<App />); });

  // Phase 3: click Workspace tab so done modal is visible
  const wsTab = screen.getByText('Workspace');
  await act(async () => { fireEvent.click(wsTab); });

  return result;
}

describe('Fix It button error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows error notification when Fix It button click fails (session expired)', async () => {
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
});

describe('Post-bug-report Fix button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows "Fix reported bugs" button after Bug Detective meeting ends with kid messages', async () => {
    await renderWithBugMeetingEnded();
    expect(screen.getByText('Fix reported bugs')).toBeInTheDocument();
  });

  it('calls requestFix and shows progress indicator when Fix button clicked', async () => {
    await renderWithBugMeetingEnded();

    const fixButton = screen.getByText('Fix reported bugs');
    await act(async () => { fireEvent.click(fixButton); });

    // requestFix should be called with concatenated kid messages
    expect(mockRequestFix).toHaveBeenCalledWith(
      'The button does not work\nAlso the color is wrong'
    );

    // Button should be replaced with progress indicator
    expect(screen.queryByText('Fix reported bugs')).not.toBeInTheDocument();
    expect(screen.getByText('Fix in progress...')).toBeInTheDocument();
  });

  it('does not show Fix button if Bug Detective had no kid messages', async () => {
    const agentOnlyMeeting = {
      ...bugMeeting,
      meetingId: 'mtg-3',
      messages: [{ role: 'agent' as const, content: 'What bug did you find?' }],
    };
    await renderWithBugMeetingEnded(agentOnlyMeeting);
    expect(screen.queryByText('Fix reported bugs')).not.toBeInTheDocument();
  });

  it('does not show Fix button when a non-debug meeting ends', async () => {
    const nonDebugMeeting = {
      ...bugMeeting,
      meetingId: 'mtg-4',
      meetingTypeId: 'explain-it',
      agentName: 'Explainer',
    };
    await renderWithBugMeetingEnded(nonDebugMeeting);
    expect(screen.queryByText('Fix reported bugs')).not.toBeInTheDocument();
  });
});
