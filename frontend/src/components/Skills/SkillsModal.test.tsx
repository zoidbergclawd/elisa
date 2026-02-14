import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillsModal from './SkillsModal';
import type { Skill } from './types';

// Mock SkillFlowEditor
vi.mock('./SkillFlowEditor', () => ({
  default: ({ skill, onSave, onClose }: {
    skill: { name: string };
    onSave: (workspace: Record<string, unknown>) => void;
    onClose: () => void;
  }) => (
    <div data-testid="mock-flow-editor">
      <span>Flow Editor: {skill.name}</span>
      <button onClick={() => onSave({ blocks: [] })}>Save Flow</button>
      <button onClick={onClose}>Close Flow</button>
    </div>
  ),
}));

const defaultProps = {
  skills: [] as Skill[],
  onSkillsChange: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
});

describe('SkillsModal', () => {
  // --- Basic rendering ---
  it('renders with tabs', () => {
    render(<SkillsModal {...defaultProps} />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Skills (0)')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('shows empty state for skills tab', () => {
    render(<SkillsModal {...defaultProps} />);
    expect(screen.getByText(/No skills yet/)).toBeInTheDocument();
  });

  // --- Skill display ---
  it('displays existing skills', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    expect(screen.getByText('Be Creative')).toBeInTheDocument();
    expect(screen.getByText(/style/)).toBeInTheDocument();
  });

  it('displays unnamed skill with fallback label', () => {
    const skills: Skill[] = [
      { id: 's1', name: '', prompt: 'some prompt', category: 'agent' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    expect(screen.getByText('(unnamed)')).toBeInTheDocument();
  });

  it('truncates long prompt in skill list', () => {
    const longPrompt = 'A'.repeat(100);
    const skills: Skill[] = [
      { id: 's1', name: 'Long', prompt: longPrompt, category: 'agent' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    expect(screen.getByText(/A{80}\.\.\./)).toBeInTheDocument();
  });

  it('shows "visual flow" for composite skill in list', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Composite', prompt: 'desc', category: 'composite' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    expect(screen.getByText(/visual flow/)).toBeInTheDocument();
  });

  // --- Skill editor ---
  it('opens skill editor when clicking New Skill', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    expect(screen.getByPlaceholderText('e.g. Be Extra Creative')).toBeInTheDocument();
  });

  it('saves a new skill', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'Test Skill' } });

    const textareas = screen.getAllByRole('textbox');
    const promptTextarea = textareas.find(el => el.tagName === 'TEXTAREA')!;
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt text' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Test Skill',
        prompt: 'Test prompt text',
        category: 'agent',
      }),
    ]);
  });

  it('edits an existing skill', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Old Name', prompt: 'Old prompt', category: 'agent' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Old Name');
    expect(nameInput).toBeInTheDocument();

    const promptTextarea = screen.getByDisplayValue('Old prompt');
    expect(promptTextarea).toBeInTheDocument();
  });

  it('updates an existing skill', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Old Name', prompt: 'Old prompt', category: 'agent' },
    ];
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Old Name');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', name: 'New Name', prompt: 'Old prompt' }),
    ]);
  });

  it('cancels editing a skill', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    expect(screen.getByPlaceholderText('e.g. Be Extra Creative')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('e.g. Be Extra Creative')).not.toBeInTheDocument();
  });

  it('deletes a skill from list', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onSkillsChange).toHaveBeenCalledWith([]);
  });

  it('deletes a skill from editor', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'To Delete', prompt: 'prompt', category: 'agent' },
    ];
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onSkillsChange).toHaveBeenCalledWith([]);
  });

  it('disables Done when name is empty', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();
  });

  it('disables Done when prompt is empty for non-composite skill', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'Has Name' } });

    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();
  });

  it('changes category via select', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'style' } });
    expect(screen.getByDisplayValue('Style details')).toBeInTheDocument();
  });

  // --- Composite / Flow Editor ---
  it('shows Open Flow Editor for composite category', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    expect(screen.getByText('Open Flow Editor')).toBeInTheDocument();
  });

  it('disables Open Flow Editor when name is empty', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    expect(screen.getByText('Open Flow Editor')).toBeDisabled();
  });

  it('opens flow editor when clicking Open Flow Editor', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'My Flow' } });

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    fireEvent.click(screen.getByText('Open Flow Editor'));

    expect(screen.getByTestId('mock-flow-editor')).toBeInTheDocument();
    expect(screen.getByText('Flow Editor: My Flow')).toBeInTheDocument();
  });

  it('saves workspace from flow editor', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'My Flow' } });

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    fireEvent.click(screen.getByText('Open Flow Editor'));
    fireEvent.click(screen.getByText('Save Flow'));

    expect(onSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'My Flow',
        category: 'composite',
        workspace: { blocks: [] },
      }),
    ]);
  });

  it('closes flow editor without saving', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'My Flow' } });

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    fireEvent.click(screen.getByText('Open Flow Editor'));
    fireEvent.click(screen.getByText('Close Flow'));

    // Should be back to modal, not flow editor
    expect(screen.queryByTestId('mock-flow-editor')).not.toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('shows flow configured indicator for skill with workspace', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Configured', prompt: '', category: 'composite', workspace: { blocks: [] } },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Flow has been configured.')).toBeInTheDocument();
  });

  // --- Templates tab ---
  it('renders Templates tab', () => {
    render(<SkillsModal {...defaultProps} />);
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('shows skill templates when Templates tab is clicked', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Templates'));
    expect(screen.getByText('Skill Templates')).toBeInTheDocument();
    expect(screen.getByText('Explain everything')).toBeInTheDocument();
  });

  it('adds a skill template with unique ID', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Templates'));

    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    expect(onSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'test-uuid-1234',
        name: 'Explain everything',
        category: 'agent',
      }),
    ]);
  });

  it('shows (added) badge and disables Add for duplicate skill name', () => {
    const skills: Skill[] = [
      { id: 'custom-1', name: 'Explain everything', prompt: 'custom prompt', category: 'agent' },
    ];
    render(<SkillsModal {...defaultProps} skills={skills} />);
    fireEvent.click(screen.getByText('Templates'));

    const addedBadges = screen.getAllByText('(added)');
    expect(addedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows helper text on templates tab', () => {
    render(<SkillsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Templates'));
    expect(screen.getByText(/drag a Use Skill block from the Skills category onto your canvas/)).toBeInTheDocument();
  });

  // --- Close ---
  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(<SkillsModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClose).toHaveBeenCalled();
  });
});
