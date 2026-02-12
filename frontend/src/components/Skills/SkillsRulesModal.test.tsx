import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillsRulesModal from './SkillsRulesModal';
import type { Skill, Rule } from './types';

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
  rules: [] as Rule[],
  onSkillsChange: vi.fn(),
  onRulesChange: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  // Mock crypto.randomUUID
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
});

describe('SkillsRulesModal', () => {
  // --- Basic rendering ---
  it('renders with tabs', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    expect(screen.getByText('Skills & Rules')).toBeInTheDocument();
    expect(screen.getByText('Skills (0)')).toBeInTheDocument();
    expect(screen.getByText('Rules (0)')).toBeInTheDocument();
  });

  it('shows empty state for skills tab', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    expect(screen.getByText(/No skills yet/)).toBeInTheDocument();
  });

  it('shows empty state for rules tab', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    expect(screen.getByText(/No rules yet/)).toBeInTheDocument();
  });

  // --- Skill display ---
  it('displays existing skills', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
    expect(screen.getByText('Be Creative')).toBeInTheDocument();
    expect(screen.getByText(/style/)).toBeInTheDocument();
  });

  it('displays existing rules', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Always Comment', prompt: 'Add comments', trigger: 'always' },
    ];
    render(<SkillsRulesModal {...defaultProps} rules={rules} />);
    fireEvent.click(screen.getByText('Rules (1)'));
    expect(screen.getByText('Always Comment')).toBeInTheDocument();
  });

  it('counts skills and rules in tab labels', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'S1', prompt: 'p', category: 'agent' },
      { id: 's2', name: 'S2', prompt: 'p', category: 'feature' },
    ];
    const rules: Rule[] = [
      { id: 'r1', name: 'R1', prompt: 'p', trigger: 'always' },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} rules={rules} />);
    expect(screen.getByText('Skills (2)')).toBeInTheDocument();
    expect(screen.getByText('Rules (1)')).toBeInTheDocument();
  });

  it('displays unnamed skill with fallback label', () => {
    const skills: Skill[] = [
      { id: 's1', name: '', prompt: 'some prompt', category: 'agent' },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
    expect(screen.getByText('(unnamed)')).toBeInTheDocument();
  });

  it('truncates long prompt in skill list', () => {
    const longPrompt = 'A'.repeat(100);
    const skills: Skill[] = [
      { id: 's1', name: 'Long', prompt: longPrompt, category: 'agent' },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
    expect(screen.getByText(/A{80}\.\.\./)).toBeInTheDocument();
  });

  it('shows "visual flow" for composite skill in list', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Composite', prompt: 'desc', category: 'composite' },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
    expect(screen.getByText(/visual flow/)).toBeInTheDocument();
  });

  // --- Skill editor ---
  it('opens skill editor when clicking New Skill', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    expect(screen.getByPlaceholderText('e.g. Be Extra Creative')).toBeInTheDocument();
  });

  it('saves a new skill', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} onSkillsChange={onSkillsChange} />);
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
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
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
    render(<SkillsRulesModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Old Name');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onSkillsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', name: 'New Name', prompt: 'Old prompt' }),
    ]);
  });

  it('cancels editing a skill', () => {
    render(<SkillsRulesModal {...defaultProps} />);
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
    render(<SkillsRulesModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onSkillsChange).toHaveBeenCalledWith([]);
  });

  it('deletes a skill from editor', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'To Delete', prompt: 'prompt', category: 'agent' },
    ];
    const onSkillsChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onSkillsChange).toHaveBeenCalledWith([]);
  });

  it('disables Done when name is empty', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();
  });

  it('disables Done when prompt is empty for non-composite skill', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'Has Name' } });

    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();
  });

  it('changes category via select', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'style' } });
    expect(screen.getByDisplayValue('Style details')).toBeInTheDocument();
  });

  // --- Composite / Flow Editor ---
  it('shows Open Flow Editor for composite category', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    expect(screen.getByText('Open Flow Editor')).toBeInTheDocument();
  });

  it('disables Open Flow Editor when name is empty', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    expect(screen.getByText('Open Flow Editor')).toBeDisabled();
  });

  it('opens flow editor when clicking Open Flow Editor', () => {
    const onSkillsChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} onSkillsChange={onSkillsChange} />);
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
    render(<SkillsRulesModal {...defaultProps} onSkillsChange={onSkillsChange} />);
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
    render(<SkillsRulesModal {...defaultProps} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('+ New Skill'));

    const nameInput = screen.getByPlaceholderText('e.g. Be Extra Creative');
    fireEvent.change(nameInput, { target: { value: 'My Flow' } });

    const select = screen.getByDisplayValue('Agent behavior');
    fireEvent.change(select, { target: { value: 'composite' } });

    fireEvent.click(screen.getByText('Open Flow Editor'));
    fireEvent.click(screen.getByText('Close Flow'));

    // Should be back to modal, not flow editor
    expect(screen.queryByTestId('mock-flow-editor')).not.toBeInTheDocument();
    expect(screen.getByText('Skills & Rules')).toBeInTheDocument();
  });

  it('shows flow configured indicator for skill with workspace', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Configured', prompt: '', category: 'composite', workspace: { blocks: [] } },
    ];
    render(<SkillsRulesModal {...defaultProps} skills={skills} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Flow has been configured.')).toBeInTheDocument();
  });

  // --- Rule editor ---
  it('opens rule editor when clicking New Rule', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));
    expect(screen.getByPlaceholderText('e.g. Always Add Comments')).toBeInTheDocument();
  });

  it('saves a new rule', () => {
    const onRulesChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));

    const nameInput = screen.getByPlaceholderText('e.g. Always Add Comments');
    fireEvent.change(nameInput, { target: { value: 'Test Rule' } });

    const textareas = screen.getAllByRole('textbox');
    const promptTextarea = textareas.find(el => el.tagName === 'TEXTAREA')!;
    fireEvent.change(promptTextarea, { target: { value: 'Test rule prompt' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onRulesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Test Rule',
        prompt: 'Test rule prompt',
        trigger: 'always',
      }),
    ]);
  });

  it('edits an existing rule', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Old Rule', prompt: 'Old rule prompt', trigger: 'always' },
    ];
    render(<SkillsRulesModal {...defaultProps} rules={rules} />);
    fireEvent.click(screen.getByText('Rules (1)'));
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByDisplayValue('Old Rule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old rule prompt')).toBeInTheDocument();
  });

  it('deletes a rule from the list', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Delete Me', prompt: 'prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Rules (1)'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onRulesChange).toHaveBeenCalledWith([]);
  });

  it('deletes a rule from the editor', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Delete Me', prompt: 'prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Rules (1)'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onRulesChange).toHaveBeenCalledWith([]);
  });

  it('cancels editing a rule', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));
    expect(screen.getByPlaceholderText('e.g. Always Add Comments')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('e.g. Always Add Comments')).not.toBeInTheDocument();
  });

  it('changes rule trigger via select', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'on_test_fail' } });
    expect(screen.getByDisplayValue('On test fail')).toBeInTheDocument();
  });

  it('disables Done when rule name or prompt is empty', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));

    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();

    // Add name only
    const nameInput = screen.getByPlaceholderText('e.g. Always Add Comments');
    fireEvent.change(nameInput, { target: { value: 'Has Name' } });
    expect(doneBtn).toBeDisabled();
  });

  // --- Tab switching ---
  it('clears skill editor when switching to rules tab', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    expect(screen.getByPlaceholderText('e.g. Be Extra Creative')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('Skills (0)'));
    // Editor should be cleared, back to empty state
    expect(screen.getByText(/No skills yet/)).toBeInTheDocument();
  });

  // --- Close ---
  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(<SkillsRulesModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClose).toHaveBeenCalled();
  });
});
