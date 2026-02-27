import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackLoopIndicator from './FeedbackLoopIndicator';
import type { CorrectionCycleState } from '../../types';

function makeCycle(overrides?: Partial<CorrectionCycleState>): CorrectionCycleState {
  return {
    task_id: 'task-1',
    attempt_number: 1,
    max_attempts: 3,
    step: 'diagnosing',
    converged: false,
    attempts: [],
    ...overrides,
  };
}

describe('FeedbackLoopIndicator', () => {
  it('renders attempt counter', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ attempt_number: 1, max_attempts: 3 })} />);
    expect(screen.getByText('Attempt 2 of 3')).toBeInTheDocument();
  });

  it('shows diagnosing step', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ step: 'diagnosing' })} />);
    expect(screen.getByText('Diagnosing...')).toBeInTheDocument();
  });

  it('shows fixing step', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ step: 'fixing' })} />);
    expect(screen.getByText('Fixing...')).toBeInTheDocument();
  });

  it('shows retesting step', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ step: 'retesting' })} />);
    expect(screen.getByText('Retesting...')).toBeInTheDocument();
  });

  it('shows converged state', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ converged: true })} />);
    expect(screen.getByText('Converged')).toBeInTheDocument();
  });

  it('renders the indicator with correct test id', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle()} />);
    expect(screen.getByTestId('feedback-loop-indicator')).toBeInTheDocument();
  });

  it('does not show step label when step is undefined', () => {
    render(<FeedbackLoopIndicator cycle={makeCycle({ step: undefined })} />);
    expect(screen.queryByText('Diagnosing...')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixing...')).not.toBeInTheDocument();
    expect(screen.queryByText('Retesting...')).not.toBeInTheDocument();
  });
});
