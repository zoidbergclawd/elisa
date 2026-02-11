import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExamplePickerModal from './ExamplePickerModal';
import type { ExampleNugget } from '../../lib/examples';

const examples: ExampleNugget[] = [
  {
    id: 'test-1',
    name: 'Test Example',
    description: 'A test example nugget.',
    category: 'web',
    color: 'bg-blue-100',
    accentColor: 'text-blue-700',
    workspace: { blocks: { blocks: [{ type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } }] } },
    skills: [],
    rules: [],
    portals: [],
  },
  {
    id: 'test-2',
    name: 'Second Example',
    description: 'Another example.',
    category: 'game',
    color: 'bg-amber-100',
    accentColor: 'text-amber-700',
    workspace: { blocks: { blocks: [{ type: 'nugget_goal', fields: { GOAL_TEXT: 'game' } }] } },
    skills: [],
    rules: [],
    portals: [],
  },
];

describe('ExamplePickerModal', () => {
  it('renders example cards', () => {
    render(
      <ExamplePickerModal examples={examples} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByText('Test Example')).toBeDefined();
    expect(screen.getByText('Second Example')).toBeDefined();
    expect(screen.getByText('A test example nugget.')).toBeDefined();
  });

  it('calls onSelect when a card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <ExamplePickerModal examples={examples} onSelect={onSelect} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('example-card-test-1'));
    expect(onSelect).toHaveBeenCalledWith(examples[0]);
  });

  it('calls onClose when blank canvas link is clicked', () => {
    const onClose = vi.fn();
    render(
      <ExamplePickerModal examples={examples} onSelect={vi.fn()} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText('or start with a blank canvas'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows category badges', () => {
    render(
      <ExamplePickerModal examples={examples} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByText('Web')).toBeDefined();
    expect(screen.getByText('Game')).toBeDefined();
  });
});
