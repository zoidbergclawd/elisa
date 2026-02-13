import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TaskMapPanel from './TaskMapPanel';
import type { Task } from '../../types';

// Mock ReactFlow since it needs DOM measurements
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes }: Record<string, unknown>) => <div data-testid="react-flow">{(nodes as unknown[])?.length ?? 0} nodes</div>,
  ReactFlowProvider: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

describe('TaskMapPanel', () => {
  it('shows empty state when no tasks', () => {
    render(<TaskMapPanel tasks={[]} />);
    expect(screen.getByText('Tasks will appear here during a build')).toBeInTheDocument();
  });

  it('renders TaskDAG when tasks exist', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskMapPanel tasks={tasks} />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
