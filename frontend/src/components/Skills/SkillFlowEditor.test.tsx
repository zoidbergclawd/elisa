import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillFlowEditor from './SkillFlowEditor';
import type { Skill } from './types';

// --- Mocks ---

// Track the most recent onOutput callback for simulating streaming
let mockStartRun = vi.fn();
const mockUseSkillSession = {
  sessionId: null as string | null,
  running: false,
  result: null as string | null,
  error: null as string | null,
  steps: [] as Array<{ stepId: string; stepType: string; status: string }>,
  outputs: [] as string[],
  questionRequest: null as null | { stepId: string; questions: Array<{ question: string }> },
  startRun: mockStartRun,
  answerQuestion: vi.fn(),
};

vi.mock('../../hooks/useSkillSession', () => ({
  useSkillSession: () => mockUseSkillSession,
}));

// Mock Blockly: provide enough surface for the component to render
const mockWorkspaceSvg = {
  dispose: vi.fn(),
};
const mockBlocklySave = vi.fn().mockReturnValue({ blocks: { blocks: [] } });
const mockBlocklyLoad = vi.fn();

vi.mock('blockly', () => ({
  default: {},
  inject: vi.fn(() => mockWorkspaceSvg),
  serialization: {
    workspaces: {
      save: (...args: unknown[]) => mockBlocklySave(...args),
      load: (...args: unknown[]) => mockBlocklyLoad(...args),
    },
  },
}));

vi.mock('../BlockCanvas/skillFlowBlocks', () => ({
  registerSkillFlowBlocks: vi.fn(),
}));

vi.mock('../BlockCanvas/skillFlowToolbox', () => ({
  skillFlowToolbox: { kind: 'categoryToolbox', contents: [] },
}));

vi.mock('../BlockCanvas/skillInterpreter', () => ({
  interpretSkillWorkspace: vi.fn().mockReturnValue({
    skillId: 'test-skill',
    skillName: 'Test Skill',
    steps: [{ id: 's1', type: 'output', template: 'hello' }],
  }),
}));

vi.mock('./SkillQuestionModal', () => ({
  default: ({ stepId }: { stepId: string }) => (
    <div data-testid="mock-question-modal">Question for {stepId}</div>
  ),
}));

const defaultSkill: Skill = {
  id: 'skill-1',
  name: 'My Test Skill',
  prompt: '',
  category: 'composite',
};

const defaultProps = {
  skill: defaultSkill,
  allSkills: [] as Skill[],
  onSave: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStartRun = vi.fn();
  mockUseSkillSession.sessionId = null;
  mockUseSkillSession.running = false;
  mockUseSkillSession.result = null;
  mockUseSkillSession.error = null;
  mockUseSkillSession.steps = [];
  mockUseSkillSession.outputs = [];
  mockUseSkillSession.questionRequest = null;
  mockUseSkillSession.startRun = mockStartRun;
});

describe('SkillFlowEditor', () => {
  it('renders the skill name input with the skill name', () => {
    render(<SkillFlowEditor {...defaultProps} />);
    const input = screen.getByPlaceholderText('Skill name') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('My Test Skill');
  });

  it('renders Save, Run, and Close buttons', () => {
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('calls onSave with workspace state when Save is clicked', () => {
    const onSave = vi.fn();
    render(<SkillFlowEditor {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save'));
    expect(mockBlocklySave).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith({ blocks: { blocks: [] } });
  });

  it('calls startRun when Run is clicked', () => {
    render(<SkillFlowEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Run'));
    expect(mockStartRun).toHaveBeenCalled();
  });

  it('disables Run button when running', () => {
    mockUseSkillSession.running = true;
    render(<SkillFlowEditor {...defaultProps} />);
    const runBtn = screen.getByText('Running...');
    expect(runBtn).toBeDisabled();
  });

  it('shows progress bar when running', () => {
    mockUseSkillSession.running = true;
    mockUseSkillSession.steps = [
      { stepId: 's1', stepType: 'set_context', status: 'completed' },
      { stepId: 's2', stepType: 'run_agent', status: 'started' },
    ];
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByText('Step 1/2')).toBeInTheDocument();
  });

  it('shows latest output text when running', () => {
    mockUseSkillSession.running = true;
    mockUseSkillSession.outputs = ['First output', 'Second output'];
    mockUseSkillSession.steps = [
      { stepId: 's1', stepType: 'output', status: 'completed' },
    ];
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByText('Second output')).toBeInTheDocument();
  });

  it('shows result on completion', () => {
    mockUseSkillSession.result = 'Final answer: 42';
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByText('Result: Final answer: 42')).toBeInTheDocument();
  });

  it('shows error on failure', () => {
    mockUseSkillSession.error = 'Something went wrong';
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByText('Error: Something went wrong')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    render(<SkillFlowEditor {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows question modal when questionRequest is active', () => {
    mockUseSkillSession.sessionId = 'session-123';
    mockUseSkillSession.questionRequest = {
      stepId: 'step-q1',
      questions: [{ question: 'Pick color' }],
    };
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.getByTestId('mock-question-modal')).toBeInTheDocument();
    expect(screen.getByText('Question for step-q1')).toBeInTheDocument();
  });

  it('does not show question modal when sessionId is null', () => {
    mockUseSkillSession.sessionId = null;
    mockUseSkillSession.questionRequest = {
      stepId: 'step-q1',
      questions: [{ question: 'Pick color' }],
    };
    render(<SkillFlowEditor {...defaultProps} />);
    expect(screen.queryByTestId('mock-question-modal')).not.toBeInTheDocument();
  });

  it('does not show progress/result bar when idle', () => {
    render(<SkillFlowEditor {...defaultProps} />);
    // When not running, no result, no error -- no progress bar
    expect(screen.queryByText(/Step/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it('updates skill name via input', () => {
    render(<SkillFlowEditor {...defaultProps} />);
    const input = screen.getByPlaceholderText('Skill name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed Skill' } });
    expect(input.value).toBe('Renamed Skill');
  });
});
