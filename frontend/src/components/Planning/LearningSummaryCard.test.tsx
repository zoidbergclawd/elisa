import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LearningSummaryCard from './LearningSummaryCard';
import type { LearningSummary } from '../../types';

const fullSummary: LearningSummary = {
  decisions: ['Chose web deployment', 'Used REST API portal'],
  patterns_discovered: ['API-driven apps need error handling'],
  tradeoffs: ['Simpler UI vs more features'],
  next_time_suggestion: 'Try starting with the deploy target first',
};

const emptySummary: LearningSummary = {
  decisions: [],
  patterns_discovered: [],
  tradeoffs: [],
  next_time_suggestion: null,
};

describe('LearningSummaryCard', () => {
  it('renders nothing for empty summary', () => {
    const { container } = render(
      <LearningSummaryCard summary={emptySummary} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the card for non-empty summary', () => {
    render(<LearningSummaryCard summary={fullSummary} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('learning-summary-card')).toBeInTheDocument();
    expect(screen.getByText('What You Learned')).toBeInTheDocument();
  });

  it('renders decisions section', () => {
    render(<LearningSummaryCard summary={fullSummary} onDismiss={vi.fn()} />);
    expect(screen.getByText('Decisions Made')).toBeInTheDocument();
    expect(screen.getByText('- Chose web deployment')).toBeInTheDocument();
    expect(screen.getByText('- Used REST API portal')).toBeInTheDocument();
  });

  it('renders patterns section', () => {
    render(<LearningSummaryCard summary={fullSummary} onDismiss={vi.fn()} />);
    expect(screen.getByText('Patterns Discovered')).toBeInTheDocument();
    expect(screen.getByText('- API-driven apps need error handling')).toBeInTheDocument();
  });

  it('renders tradeoffs section', () => {
    render(<LearningSummaryCard summary={fullSummary} onDismiss={vi.fn()} />);
    expect(screen.getByText('Tradeoffs')).toBeInTheDocument();
    expect(screen.getByText('- Simpler UI vs more features')).toBeInTheDocument();
  });

  it('renders next time suggestion', () => {
    render(<LearningSummaryCard summary={fullSummary} onDismiss={vi.fn()} />);
    expect(screen.getByText('Next Time')).toBeInTheDocument();
    expect(screen.getByText('Try starting with the deploy target first')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(<LearningSummaryCard summary={fullSummary} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss learning summary'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders with only decisions', () => {
    const partial: LearningSummary = {
      decisions: ['One decision'],
      patterns_discovered: [],
      tradeoffs: [],
      next_time_suggestion: null,
    };
    render(<LearningSummaryCard summary={partial} onDismiss={vi.fn()} />);
    expect(screen.getByText('Decisions Made')).toBeInTheDocument();
    expect(screen.queryByText('Patterns Discovered')).not.toBeInTheDocument();
    expect(screen.queryByText('Tradeoffs')).not.toBeInTheDocument();
    expect(screen.queryByText('Next Time')).not.toBeInTheDocument();
  });

  it('renders with only next_time_suggestion', () => {
    const partial: LearningSummary = {
      decisions: [],
      patterns_discovered: [],
      tradeoffs: [],
      next_time_suggestion: 'Think about deploy early',
    };
    render(<LearningSummaryCard summary={partial} onDismiss={vi.fn()} />);
    expect(screen.getByText('Next Time')).toBeInTheDocument();
    expect(screen.queryByText('Decisions Made')).not.toBeInTheDocument();
  });
});
