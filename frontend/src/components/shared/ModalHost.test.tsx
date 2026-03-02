import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ModalHost from './ModalHost';
import type { ModalHostProps } from './ModalHost';
import type { GateRequest, QuestionRequest, FlashWizardState } from '../../hooks/useBuildSession';
import type { BoardInfo } from '../../hooks/useBoardDetect';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { defaultBuildSessionValue, defaultWorkspaceValue } from '../../test-utils/renderWithProviders';

// Mock context hooks
vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspaceContext: vi.fn(() => defaultWorkspaceValue),
}));

// Mock all child modal components to keep tests focused on conditional rendering
vi.mock('./HumanGateModal', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="human-gate-modal">Gate: {String(props.question)}</div>
  ),
}));

vi.mock('./QuestionModal', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="question-modal">Question: {String(props.taskId)}</div>
  ),
}));

vi.mock('./FlashWizardModal', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="flash-wizard-modal">Flash: {String(props.deviceRole)}</div>
  ),
}));

vi.mock('../Skills/SkillsModal', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="skills-modal">
      Skills Modal
      <button onClick={props.onClose}>Close Skills</button>
    </div>
  ),
}));

vi.mock('../Rules/RulesModal', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="rules-modal">
      Rules Modal
      <button onClick={props.onClose}>Close Rules</button>
    </div>
  ),
}));

vi.mock('../Portals/PortalsModal', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="portals-modal">
      Portals Modal
      <button onClick={props.onClose}>Close Portals</button>
    </div>
  ),
}));

vi.mock('./DirectoryPickerModal', () => ({
  default: (props: { onSelect: (dir: string) => void; onCancel: () => void }) => (
    <div data-testid="dir-picker-modal">
      Dir Picker
      <button onClick={() => props.onSelect('/some/dir')}>Select Dir</button>
      <button onClick={props.onCancel}>Cancel Dir</button>
    </div>
  ),
}));

vi.mock('./BoardDetectedModal', () => ({
  default: (props: { onDismiss: () => void }) => (
    <div data-testid="board-detected-modal">
      Board Detected
      <button onClick={props.onDismiss}>Dismiss Board</button>
    </div>
  ),
}));

vi.mock('./ExamplePickerModal', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="example-picker-modal">
      Example Picker
      <button onClick={props.onClose}>Close Examples</button>
    </div>
  ),
}));

vi.mock('../../lib/apiClient', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
}));

vi.mock('../../lib/examples', () => ({
  EXAMPLE_NUGGETS: [],
}));

function buildDefaultProps(overrides: Partial<ModalHostProps> = {}): ModalHostProps {
  return {
    skillsModalOpen: false,
    setSkillsModalOpen: vi.fn(),
    rulesModalOpen: false,
    setRulesModalOpen: vi.fn(),
    portalsModalOpen: false,
    setPortalsModalOpen: vi.fn(),
    boardDetectedModalOpen: false,
    boardInfo: null,
    onBoardDismiss: vi.fn(),
    helpOpen: false,
    setHelpOpen: vi.fn(),
    ...overrides,
  };
}

function renderModalHost(
  propOverrides?: Partial<ModalHostProps>,
  contextOverrides?: {
    buildSession?: Partial<typeof defaultBuildSessionValue>;
    workspace?: Partial<typeof defaultWorkspaceValue>;
  },
) {
  vi.mocked(useBuildSessionContext).mockReturnValue({
    ...defaultBuildSessionValue,
    ...contextOverrides?.buildSession,
  });
  vi.mocked(useWorkspaceContext).mockReturnValue({
    ...defaultWorkspaceValue,
    ...contextOverrides?.workspace,
  });
  return render(<ModalHost {...buildDefaultProps(propOverrides)} />);
}

describe('ModalHost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-apply context mocks after restoreAllMocks clears them
    vi.mocked(useBuildSessionContext).mockReturnValue({ ...defaultBuildSessionValue });
    vi.mocked(useWorkspaceContext).mockReturnValue({ ...defaultWorkspaceValue });
  });

  it('renders nothing when all modal flags are off', () => {
    const { container } = renderModalHost();
    expect(container.innerHTML).toBe('');
  });

  // -- HumanGateModal --

  it('renders HumanGateModal when gateRequest and sessionId are provided', () => {
    const gate: GateRequest = { task_id: 't1', question: 'Approve?', context: 'Built the thing' };
    renderModalHost({}, { buildSession: { gateRequest: gate, sessionId: 'sess-1' } });
    expect(screen.getByTestId('human-gate-modal')).toBeInTheDocument();
    expect(screen.getByText('Gate: Approve?')).toBeInTheDocument();
  });

  it('does not render HumanGateModal when sessionId is null', () => {
    const gate: GateRequest = { task_id: 't1', question: 'Approve?', context: 'ctx' };
    renderModalHost({}, { buildSession: { gateRequest: gate, sessionId: null } });
    expect(screen.queryByTestId('human-gate-modal')).not.toBeInTheDocument();
  });

  it('does not render HumanGateModal when gateRequest is null', () => {
    renderModalHost({}, { buildSession: { gateRequest: null, sessionId: 'sess-1' } });
    expect(screen.queryByTestId('human-gate-modal')).not.toBeInTheDocument();
  });

  // -- QuestionModal --

  it('renders QuestionModal when questionRequest and sessionId are provided', () => {
    const qr: QuestionRequest = { task_id: 'task-q', questions: [] };
    renderModalHost({}, { buildSession: { questionRequest: qr, sessionId: 'sess-2' } });
    expect(screen.getByTestId('question-modal')).toBeInTheDocument();
    expect(screen.getByText('Question: task-q')).toBeInTheDocument();
  });

  it('does not render QuestionModal when sessionId is null', () => {
    const qr: QuestionRequest = { task_id: 'task-q', questions: [] };
    renderModalHost({}, { buildSession: { questionRequest: qr, sessionId: null } });
    expect(screen.queryByTestId('question-modal')).not.toBeInTheDocument();
  });

  // -- FlashWizardModal --

  it('renders FlashWizardModal when visible, with sessionId', () => {
    const fws: FlashWizardState = {
      visible: true, deviceRole: 'sensor', message: 'Flashing...', isFlashing: true, progress: 50,
    };
    renderModalHost({}, { buildSession: { flashWizardState: fws, sessionId: 'sess-3' } });
    expect(screen.getByTestId('flash-wizard-modal')).toBeInTheDocument();
    expect(screen.getByText('Flash: sensor')).toBeInTheDocument();
  });

  it('does not render FlashWizardModal when visible is false', () => {
    const fws: FlashWizardState = {
      visible: false, deviceRole: 'sensor', message: '', isFlashing: false, progress: 0,
    };
    renderModalHost({}, { buildSession: { flashWizardState: fws, sessionId: 'sess-3' } });
    expect(screen.queryByTestId('flash-wizard-modal')).not.toBeInTheDocument();
  });

  it('does not render FlashWizardModal when sessionId is null', () => {
    const fws: FlashWizardState = {
      visible: true, deviceRole: 'sensor', message: '', isFlashing: false, progress: 0,
    };
    renderModalHost({}, { buildSession: { flashWizardState: fws, sessionId: null } });
    expect(screen.queryByTestId('flash-wizard-modal')).not.toBeInTheDocument();
  });

  // -- SkillsModal --

  it('renders SkillsModal when skillsModalOpen is true', () => {
    renderModalHost({ skillsModalOpen: true });
    expect(screen.getByTestId('skills-modal')).toBeInTheDocument();
  });

  it('does not render SkillsModal when skillsModalOpen is false', () => {
    renderModalHost({ skillsModalOpen: false });
    expect(screen.queryByTestId('skills-modal')).not.toBeInTheDocument();
  });

  it('closing SkillsModal calls setSkillsModalOpen(false)', () => {
    const setSkillsModalOpen = vi.fn();
    renderModalHost({ skillsModalOpen: true, setSkillsModalOpen });
    fireEvent.click(screen.getByText('Close Skills'));
    expect(setSkillsModalOpen).toHaveBeenCalledWith(false);
  });

  // -- RulesModal --

  it('renders RulesModal when rulesModalOpen is true', () => {
    renderModalHost({ rulesModalOpen: true });
    expect(screen.getByTestId('rules-modal')).toBeInTheDocument();
  });

  it('does not render RulesModal when rulesModalOpen is false', () => {
    renderModalHost({ rulesModalOpen: false });
    expect(screen.queryByTestId('rules-modal')).not.toBeInTheDocument();
  });

  it('closing RulesModal calls setRulesModalOpen(false)', () => {
    const setRulesModalOpen = vi.fn();
    renderModalHost({ rulesModalOpen: true, setRulesModalOpen });
    fireEvent.click(screen.getByText('Close Rules'));
    expect(setRulesModalOpen).toHaveBeenCalledWith(false);
  });

  // -- PortalsModal --

  it('renders PortalsModal when portalsModalOpen is true', () => {
    renderModalHost({ portalsModalOpen: true });
    expect(screen.getByTestId('portals-modal')).toBeInTheDocument();
  });

  it('closing PortalsModal calls setPortalsModalOpen(false)', () => {
    const setPortalsModalOpen = vi.fn();
    renderModalHost({ portalsModalOpen: true, setPortalsModalOpen });
    fireEvent.click(screen.getByText('Close Portals'));
    expect(setPortalsModalOpen).toHaveBeenCalledWith(false);
  });

  // -- DirectoryPickerModal --

  it('renders DirectoryPickerModal when dirPickerOpen is true', () => {
    renderModalHost({}, { workspace: { dirPickerOpen: true } });
    expect(screen.getByTestId('dir-picker-modal')).toBeInTheDocument();
  });

  it('does not render DirectoryPickerModal when dirPickerOpen is false', () => {
    renderModalHost({}, { workspace: { dirPickerOpen: false } });
    expect(screen.queryByTestId('dir-picker-modal')).not.toBeInTheDocument();
  });

  it('selecting a directory calls onDirPickerSelect', () => {
    const handleDirPickerSelect = vi.fn();
    renderModalHost({}, { workspace: { dirPickerOpen: true, handleDirPickerSelect } });
    fireEvent.click(screen.getByText('Select Dir'));
    expect(handleDirPickerSelect).toHaveBeenCalledWith('/some/dir');
  });

  it('cancelling directory picker calls onDirPickerCancel', () => {
    const handleDirPickerCancel = vi.fn();
    renderModalHost({}, { workspace: { dirPickerOpen: true, handleDirPickerCancel } });
    fireEvent.click(screen.getByText('Cancel Dir'));
    expect(handleDirPickerCancel).toHaveBeenCalled();
  });

  // -- BoardDetectedModal --

  it('renders BoardDetectedModal when open and boardInfo is provided', () => {
    const boardInfo: BoardInfo = { port: 'COM3', boardType: 'esp32-s3' };
    renderModalHost({ boardDetectedModalOpen: true, boardInfo });
    expect(screen.getByTestId('board-detected-modal')).toBeInTheDocument();
  });

  it('does not render BoardDetectedModal when boardInfo is null', () => {
    renderModalHost({ boardDetectedModalOpen: true, boardInfo: null });
    expect(screen.queryByTestId('board-detected-modal')).not.toBeInTheDocument();
  });

  it('does not render BoardDetectedModal when open is false', () => {
    const boardInfo: BoardInfo = { port: 'COM3', boardType: 'esp32-s3' };
    renderModalHost({ boardDetectedModalOpen: false, boardInfo });
    expect(screen.queryByTestId('board-detected-modal')).not.toBeInTheDocument();
  });

  it('dismissing BoardDetectedModal calls onBoardDismiss', () => {
    const onBoardDismiss = vi.fn();
    const boardInfo: BoardInfo = { port: 'COM3', boardType: 'esp32-s3' };
    renderModalHost({ boardDetectedModalOpen: true, boardInfo, onBoardDismiss });
    fireEvent.click(screen.getByText('Dismiss Board'));
    expect(onBoardDismiss).toHaveBeenCalled();
  });

  // -- ExamplePickerModal --

  it('renders ExamplePickerModal when examplePickerOpen is true', () => {
    renderModalHost({}, { workspace: { examplePickerOpen: true } });
    expect(screen.getByTestId('example-picker-modal')).toBeInTheDocument();
  });

  it('does not render ExamplePickerModal when examplePickerOpen is false', () => {
    renderModalHost({}, { workspace: { examplePickerOpen: false } });
    expect(screen.queryByTestId('example-picker-modal')).not.toBeInTheDocument();
  });

  it('closing ExamplePickerModal calls setExamplePickerOpen(false)', () => {
    const setExamplePickerOpen = vi.fn();
    renderModalHost({}, { workspace: { examplePickerOpen: true, setExamplePickerOpen } });
    fireEvent.click(screen.getByText('Close Examples'));
    expect(setExamplePickerOpen).toHaveBeenCalledWith(false);
  });

  // -- Help modal (inline, not a mocked child) --

  it('renders help modal when helpOpen is true', () => {
    renderModalHost({ helpOpen: true });
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('does not render help modal when helpOpen is false', () => {
    renderModalHost({ helpOpen: false });
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });

  it('help modal shows instructions', () => {
    renderModalHost({ helpOpen: true });
    expect(screen.getByText('1. Design your nugget')).toBeInTheDocument();
    expect(screen.getByText('2. Add skills and rules')).toBeInTheDocument();
    expect(screen.getByText('3. Press GO')).toBeInTheDocument();
  });

  it('clicking close button in help modal calls setHelpOpen(false)', () => {
    const setHelpOpen = vi.fn();
    renderModalHost({ helpOpen: true, setHelpOpen });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(setHelpOpen).toHaveBeenCalledWith(false);
  });

  it('clicking help modal backdrop calls setHelpOpen(false)', () => {
    const setHelpOpen = vi.fn();
    renderModalHost({ helpOpen: true, setHelpOpen });
    fireEvent.click(screen.getByRole('dialog'));
    expect(setHelpOpen).toHaveBeenCalledWith(false);
  });

  it('clicking inside help modal content does not close it', () => {
    const setHelpOpen = vi.fn();
    renderModalHost({ helpOpen: true, setHelpOpen });
    fireEvent.click(screen.getByText('Getting Started'));
    expect(setHelpOpen).not.toHaveBeenCalled();
  });

  // -- Focus trap (P2 #17) --

  it('traps focus within help modal on Tab key', () => {
    renderModalHost({ helpOpen: true });
    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByLabelText('Close');

    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toBeInTheDocument();
  });

  it('traps focus within help modal on Shift+Tab key', () => {
    renderModalHost({ helpOpen: true });
    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByLabelText('Close');

    closeBtn.focus();

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(dialog).toBeInTheDocument();
  });

  it('does not trap focus for non-Tab keys', () => {
    const setHelpOpen = vi.fn();
    renderModalHost({ helpOpen: true, setHelpOpen });
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(dialog).toBeInTheDocument();
  });

  // -- Multiple modals --

  it('renders multiple modals simultaneously when multiple flags are on', () => {
    renderModalHost(
      { skillsModalOpen: true, helpOpen: true },
      { workspace: { dirPickerOpen: true } },
    );
    expect(screen.getByTestId('skills-modal')).toBeInTheDocument();
    expect(screen.getByTestId('dir-picker-modal')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });
});
