import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConvergencePanel from './ConvergencePanel';
import type { CorrectionCycleState } from '../../types';

function makeCycle(overrides?: Partial<CorrectionCycleState>): CorrectionCycleState {
  return {
    task_id: 'task-1',
    attempt_number: 1,
    max_attempts: 3,
    converged: false,
    attempts: [
      { attempt_number: 0, status: 'failed', tests_passing: 3, tests_total: 5 },
      { attempt_number: 1, status: 'failed', tests_passing: 4, tests_total: 5 },
    ],
    tests_passing: 4,
    tests_total: 5,
    ...overrides,
  };
}

describe('ConvergencePanel', () => {
  it('renders nothing when no cycles', () => {
    const { container } = render(<ConvergencePanel cycles={{}} />);
    expect(container.querySelector('[data-testid="convergence-panel"]')).not.toBeInTheDocument();
  });

  it('renders nothing when cycles have no attempts', () => {
    const { container } = render(<ConvergencePanel cycles={{
      'task-1': makeCycle({ attempts: [] }),
    }} />);
    expect(container.querySelector('[data-testid="convergence-panel"]')).not.toBeInTheDocument();
  });

  it('renders feedback loops header when cycles exist', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle() }} />);
    expect(screen.getByText('Feedback Loops')).toBeInTheDocument();
  });

  it('shows attempt history with test counts', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle() }} />);
    expect(screen.getByText('Attempt 1:')).toBeInTheDocument();
    expect(screen.getByText('3/5 tests passing')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2:')).toBeInTheDocument();
    expect(screen.getByText('4/5 tests passing')).toBeInTheDocument();
  });

  it('shows improving trend indicator', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ trend: 'improving' }) }} />);
    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toBeInTheDocument();
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  it('shows stalled trend indicator', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ trend: 'stalled' }) }} />);
    expect(screen.getByText('Stalled')).toBeInTheDocument();
  });

  it('shows diverging trend indicator', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ trend: 'diverging' }) }} />);
    expect(screen.getByText('Diverging')).toBeInTheDocument();
  });

  it('shows convergence teaching moment when converged', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ converged: true }) }} />);
    const teaching = screen.getByTestId('teaching-converged');
    expect(teaching).toBeInTheDocument();
    expect(teaching.textContent).toContain('convergence');
  });

  it('shows stalled teaching moment when stalled', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ trend: 'stalled' }) }} />);
    const teaching = screen.getByTestId('teaching-stalled');
    expect(teaching).toBeInTheDocument();
    expect(teaching.textContent).toContain('human help');
  });

  it('does not show stalled teaching when improving', () => {
    render(<ConvergencePanel cycles={{ 'task-1': makeCycle({ trend: 'improving' }) }} />);
    expect(screen.queryByTestId('teaching-stalled')).not.toBeInTheDocument();
  });

  it('renders multiple cycles', () => {
    render(<ConvergencePanel cycles={{
      'task-1': makeCycle({ task_id: 'task-1' }),
      'task-2': makeCycle({ task_id: 'task-2' }),
    }} />);
    expect(screen.getByText('task-1')).toBeInTheDocument();
    expect(screen.getByText('task-2')).toBeInTheDocument();
  });

  it('shows progress bar based on test pass ratio', () => {
    const { container } = render(<ConvergencePanel cycles={{
      'task-1': makeCycle({ tests_passing: 4, tests_total: 5 }),
    }} />);
    // Progress bar exists and shows 4/5
    expect(screen.getByText('4/5')).toBeInTheDocument();
    // Check the progress bar width (80%)
    const progressBar = container.querySelector('.bg-amber-500, .bg-emerald-500');
    if (progressBar) {
      const style = (progressBar as HTMLElement).style.width;
      expect(style).toBe('80%');
    }
  });
});
