import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ContextFlowAnimation from './ContextFlowAnimation';
import type { ContextFlow } from '../../hooks/useBuildSession';

describe('ContextFlowAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no flows', () => {
    const { container } = render(<ContextFlowAnimation flows={[]} />);
    expect(container.querySelector('[data-testid="context-flow-animation"]')).toBeNull();
  });

  it('renders animation container when a flow arrives', () => {
    const flows: ContextFlow[] = [
      { from_task_id: 'task-1', to_task_ids: ['task-2'], summary_preview: 'Built the UI', timestamp: Date.now() },
    ];
    render(<ContextFlowAnimation flows={flows} />);
    expect(screen.getByTestId('context-flow-animation')).toBeInTheDocument();
  });

  it('renders a flow dot for each active flow', () => {
    const flows: ContextFlow[] = [
      { from_task_id: 'task-1', to_task_ids: ['task-2'], summary_preview: 'Built the UI', timestamp: Date.now() },
    ];
    render(<ContextFlowAnimation flows={flows} />);
    expect(screen.getAllByTestId('context-flow-dot')).toHaveLength(1);
  });

  it('cleans up expired flows after lifetime', async () => {
    const flows: ContextFlow[] = [
      { from_task_id: 'task-1', to_task_ids: ['task-2'], summary_preview: 'Built the UI', timestamp: Date.now() },
    ];
    render(<ContextFlowAnimation flows={flows} />);
    expect(screen.getByTestId('context-flow-animation')).toBeInTheDocument();

    // Advance past the flow lifetime (2500ms)
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('context-flow-animation')).not.toBeInTheDocument();
  });

  it('has aria-hidden for accessibility', () => {
    const flows: ContextFlow[] = [
      { from_task_id: 'task-1', to_task_ids: ['task-2'], summary_preview: 'Summary', timestamp: Date.now() },
    ];
    render(<ContextFlowAnimation flows={flows} />);
    expect(screen.getByTestId('context-flow-animation').getAttribute('aria-hidden')).toBe('true');
  });

  it('does not duplicate flows with same id', () => {
    const ts = Date.now();
    const flows: ContextFlow[] = [
      { from_task_id: 'task-1', to_task_ids: ['task-2'], summary_preview: 'Built the UI', timestamp: ts },
    ];
    const { rerender } = render(<ContextFlowAnimation flows={flows} />);
    // Re-render with same flows
    rerender(<ContextFlowAnimation flows={flows} />);
    expect(screen.getAllByTestId('context-flow-dot')).toHaveLength(1);
  });
});
