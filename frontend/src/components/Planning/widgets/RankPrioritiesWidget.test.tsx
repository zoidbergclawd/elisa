import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RankPrioritiesWidget from './RankPrioritiesWidget';
import type { QuestionOption } from '../../../types';

const options: QuestionOption[] = [
  { label: 'Speed', value: 'speed' },
  { label: 'Safety', value: 'safety' },
  { label: 'Fun', value: 'fun' },
];

describe('RankPrioritiesWidget', () => {
  it('renders the question text', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Rank these')).toBeInTheDocument();
  });

  it('renders instruction text', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Drag to reorder or use arrow keys')).toBeInTheDocument();
  });

  it('renders all options with numbered positions', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Fun')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders items in initial order', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Speed');
    expect(items[1]).toHaveTextContent('Safety');
    expect(items[2]).toHaveTextContent('Fun');
  });

  it('moves item up with ArrowUp key', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    // Focus on second item and press ArrowUp
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    const updated = screen.getAllByRole('listitem');
    expect(updated[0]).toHaveTextContent('Safety');
    expect(updated[1]).toHaveTextContent('Speed');
  });

  it('moves item down with ArrowDown key', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    // Focus on first item and press ArrowDown
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    const updated = screen.getAllByRole('listitem');
    expect(updated[0]).toHaveTextContent('Safety');
    expect(updated[1]).toHaveTextContent('Speed');
  });

  it('does not move first item up', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    const updated = screen.getAllByRole('listitem');
    expect(updated[0]).toHaveTextContent('Speed');
  });

  it('does not move last item down', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.keyDown(items[2], { key: 'ArrowDown' });
    const updated = screen.getAllByRole('listitem');
    expect(updated[2]).toHaveTextContent('Fun');
  });

  it('calls onSubmit with current order on Confirm', () => {
    const onSubmit = vi.fn();
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText('Confirm order'));
    expect(onSubmit).toHaveBeenCalledWith(['speed', 'safety', 'fun']);
  });

  it('calls onSubmit with reordered values after keyboard interaction', () => {
    const onSubmit = vi.fn();
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={onSubmit} />,
    );
    const items = screen.getAllByRole('listitem');
    // Move Fun (index 2) up to index 1
    fireEvent.keyDown(items[2], { key: 'ArrowUp' });
    fireEvent.click(screen.getByText('Confirm order'));
    expect(onSubmit).toHaveBeenCalledWith(['speed', 'fun', 'safety']);
  });

  it('has group role with question as label', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: 'Rank these' })).toBeInTheDocument();
  });

  it('items have aria-labels with position and name', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    expect(screen.getByLabelText('Priority 1: Speed')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority 2: Safety')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority 3: Fun')).toBeInTheDocument();
  });

  it('items are draggable', () => {
    render(
      <RankPrioritiesWidget question="Rank these" options={options} onSubmit={vi.fn()} />,
    );
    const items = screen.getAllByRole('listitem');
    items.forEach((item) => {
      expect(item).toHaveAttribute('draggable', 'true');
    });
  });
});
