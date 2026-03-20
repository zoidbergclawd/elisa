import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionWidgetRenderer from './QuestionWidgetRenderer';
import type { QuestionWidget } from '../../../types';

const singleSelect: QuestionWidget = {
  text: 'What are you building?',
  type: 'single_select',
  options: [
    { label: 'A website', value: 'website' },
    { label: 'A game', value: 'game' },
  ],
};

const multiSelect: QuestionWidget = {
  text: 'Pick features',
  type: 'multi_select',
  options: [
    { label: 'Dark mode', value: 'dark' },
    { label: 'Sounds', value: 'sounds' },
  ],
};

const rankPriorities: QuestionWidget = {
  text: 'Rank these',
  type: 'rank_priorities',
  options: [
    { label: 'Speed', value: 'speed' },
    { label: 'Fun', value: 'fun' },
  ],
};

describe('QuestionWidgetRenderer', () => {
  it('renders SingleSelectWidget for single_select type', () => {
    render(
      <QuestionWidgetRenderer question={singleSelect} onAnswer={vi.fn()} />,
    );
    expect(screen.getByText('What are you building?')).toBeInTheDocument();
    expect(screen.getByText('A website')).toBeInTheDocument();
    expect(screen.getByText('Something else')).toBeInTheDocument();
  });

  it('renders MultiSelectWidget for multi_select type', () => {
    render(
      <QuestionWidgetRenderer question={multiSelect} onAnswer={vi.fn()} />,
    );
    expect(screen.getByText('Pick features')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
  });

  it('renders RankPrioritiesWidget for rank_priorities type', () => {
    render(
      <QuestionWidgetRenderer question={rankPriorities} onAnswer={vi.fn()} />,
    );
    expect(screen.getByText('Rank these')).toBeInTheDocument();
    expect(screen.getByText('Confirm order')).toBeInTheDocument();
  });

  it('calls onAnswer with string for single_select', () => {
    const onAnswer = vi.fn();
    render(
      <QuestionWidgetRenderer question={singleSelect} onAnswer={onAnswer} />,
    );
    fireEvent.click(screen.getByText('A game'));
    expect(onAnswer).toHaveBeenCalledWith('game');
  });

  it('calls onAnswer with string[] for multi_select', () => {
    const onAnswer = vi.fn();
    render(
      <QuestionWidgetRenderer question={multiSelect} onAnswer={onAnswer} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByText('Confirm (1)'));
    expect(onAnswer).toHaveBeenCalledWith(['dark']);
  });

  it('calls onAnswer with string[] for rank_priorities', () => {
    const onAnswer = vi.fn();
    render(
      <QuestionWidgetRenderer question={rankPriorities} onAnswer={onAnswer} />,
    );
    fireEvent.click(screen.getByText('Confirm order'));
    expect(onAnswer).toHaveBeenCalledWith(['speed', 'fun']);
  });
});
