import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiSelectWidget from './MultiSelectWidget';
import type { QuestionOption } from '../../../types';

const options: QuestionOption[] = [
  { label: 'Dark mode', value: 'dark_mode' },
  { label: 'Sound effects', value: 'sounds' },
  { label: 'Animations', value: 'animations' },
];

describe('MultiSelectWidget', () => {
  it('renders the question text', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Which features?')).toBeInTheDocument();
  });

  it('renders all options as checkboxes', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(screen.getByText('Dark mode')).toBeInTheDocument();
    expect(screen.getByText('Sound effects')).toBeInTheDocument();
    expect(screen.getByText('Animations')).toBeInTheDocument();
  });

  it('renders a disabled Confirm button when nothing is selected', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Confirm (0)')).toBeDisabled();
  });

  it('toggles checkboxes on click', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('updates Confirm button count on selection', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText('Confirm (1)')).not.toBeDisabled();
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('Confirm (2)')).not.toBeDisabled();
  });

  it('calls onSubmit with selected values on Confirm', () => {
    const onSubmit = vi.fn();
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={onSubmit} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[2]);
    fireEvent.click(screen.getByText('Confirm (2)'));
    expect(onSubmit).toHaveBeenCalledWith(['dark_mode', 'animations']);
  });

  it('does not call onSubmit when Confirm is clicked with no selections', () => {
    const onSubmit = vi.fn();
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText('Confirm (0)'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('has group role with question as label', () => {
    render(
      <MultiSelectWidget question="Which features?" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: 'Which features?' })).toBeInTheDocument();
  });
});
