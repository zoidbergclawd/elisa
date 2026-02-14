import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RulesModal from './RulesModal';
import type { Rule } from '../Skills/types';

const defaultProps = {
  rules: [] as Rule[],
  onRulesChange: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
});

describe('RulesModal', () => {
  // --- Empty state ---
  it('renders empty state correctly', () => {
    render(<RulesModal {...defaultProps} />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText(/No rules yet/)).toBeInTheDocument();
  });

  // --- Rule CRUD ---
  it('creates a new rule', () => {
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} onRulesChange={onRulesChange} />);
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

  it('edits an existing rule name', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Old Rule', prompt: 'Old prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByDisplayValue('Old Rule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Old prompt')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Old Rule');
    fireEvent.change(nameInput, { target: { value: 'Updated Rule' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onRulesChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'r1', name: 'Updated Rule', prompt: 'Old prompt' }),
    ]);
  });

  it('edits rule prompt', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'My Rule', prompt: 'Old prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const promptTextarea = screen.getByDisplayValue('Old prompt');
    fireEvent.change(promptTextarea, { target: { value: 'New prompt' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onRulesChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'r1', name: 'My Rule', prompt: 'New prompt' }),
    ]);
  });

  it('edits rule trigger', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'My Rule', prompt: 'prompt text', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Edit'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'on_test_fail' } });

    fireEvent.click(screen.getByText('Done'));

    expect(onRulesChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'r1', trigger: 'on_test_fail' }),
    ]);
  });

  it('deletes a rule from the list', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Delete Me', prompt: 'prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onRulesChange).toHaveBeenCalledWith([]);
  });

  it('deletes a rule from the editor', () => {
    const rules: Rule[] = [
      { id: 'r1', name: 'Delete Me', prompt: 'prompt', trigger: 'always' },
    ];
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} rules={rules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onRulesChange).toHaveBeenCalledWith([]);
  });

  // --- Trigger dropdown ---
  it('changes trigger dropdown correctly', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'on_test_fail' } });
    expect(screen.getByDisplayValue('On test fail')).toBeInTheDocument();
  });

  // --- Placeholder text changes per trigger type ---
  it('shows correct placeholder for always trigger', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));
    expect(screen.getByPlaceholderText(/Write a rule that always applies/)).toBeInTheDocument();
  });

  it('shows correct placeholder for on_task_complete trigger', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'on_task_complete' } });

    expect(screen.getByPlaceholderText(/What should be checked when a task is done/)).toBeInTheDocument();
  });

  it('shows correct placeholder for on_test_fail trigger', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'on_test_fail' } });

    expect(screen.getByPlaceholderText(/What should happen when tests fail/)).toBeInTheDocument();
  });

  it('shows correct placeholder for before_deploy trigger', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));

    const select = screen.getByDisplayValue('Always on');
    fireEvent.change(select, { target: { value: 'before_deploy' } });

    expect(screen.getByPlaceholderText(/What must be true before deploying/)).toBeInTheDocument();
  });

  // --- Rule template library ---
  it('renders rule templates', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('From Template'));
    expect(screen.getByText('Always add comments')).toBeInTheDocument();
    expect(screen.getByText('Test every feature')).toBeInTheDocument();
  });

  it('adds a rule from template', () => {
    const onRulesChange = vi.fn();
    render(<RulesModal {...defaultProps} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByText('From Template'));

    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[0]);

    expect(onRulesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'test-uuid-1234',
        name: 'Always add comments',
        trigger: 'always',
      }),
    ]);
  });

  it('shows (added) badge for duplicate rule template', () => {
    const rules: Rule[] = [
      { id: 'custom-1', name: 'Always add comments', prompt: 'custom', trigger: 'always' },
    ];
    render(<RulesModal {...defaultProps} rules={rules} />);
    fireEvent.click(screen.getByText('From Template'));

    const addedBadges = screen.getAllByText('(added)');
    expect(addedBadges.length).toBeGreaterThanOrEqual(1);
  });

  // --- Close ---
  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(<RulesModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClose).toHaveBeenCalled();
  });

  // --- Validation ---
  it('disables Done button until name and prompt are non-empty', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));

    const doneBtn = screen.getByText('Done');
    expect(doneBtn).toBeDisabled();

    // Add name only -- still disabled
    const nameInput = screen.getByPlaceholderText('e.g. Always Add Comments');
    fireEvent.change(nameInput, { target: { value: 'Has Name' } });
    expect(doneBtn).toBeDisabled();

    // Add prompt -- now enabled
    const textareas = screen.getAllByRole('textbox');
    const promptTextarea = textareas.find(el => el.tagName === 'TEXTAREA')!;
    fireEvent.change(promptTextarea, { target: { value: 'Has prompt' } });
    expect(doneBtn).not.toBeDisabled();
  });

  it('cancels editing and returns to list', () => {
    render(<RulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Rule'));
    expect(screen.getByPlaceholderText('e.g. Always Add Comments')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('e.g. Always Add Comments')).not.toBeInTheDocument();
    expect(screen.getByText(/No rules yet/)).toBeInTheDocument();
  });
});
