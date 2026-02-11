import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillsRulesModal from './SkillsRulesModal';
import type { Skill, Rule } from './types';

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

  it('opens skill editor when clicking New Skill', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('+ New Skill'));
    expect(screen.getByPlaceholderText('e.g. Be Extra Creative')).toBeInTheDocument();
  });

  it('opens rule editor when clicking New Rule', () => {
    render(<SkillsRulesModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Rules (0)'));
    fireEvent.click(screen.getByText('+ New Rule'));
    expect(screen.getByPlaceholderText('e.g. Always Add Comments')).toBeInTheDocument();
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

  it('deletes a skill', () => {
    const skills: Skill[] = [
      { id: 's1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    const onSkillsChange = vi.fn();
    render(<SkillsRulesModal {...defaultProps} skills={skills} onSkillsChange={onSkillsChange} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onSkillsChange).toHaveBeenCalledWith([]);
  });

  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(<SkillsRulesModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClose).toHaveBeenCalled();
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
});
