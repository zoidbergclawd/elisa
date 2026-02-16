import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TaskDAG from './TaskDAG';
import type { Task, Agent } from '../../types';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  ReactFlow: vi.fn(({ nodes, edges }: { nodes: unknown[]; edges: unknown[] }) => (
    <div data-testid="react-flow" data-nodes={nodes?.length ?? 0} data-edges={edges?.length ?? 0}>
      ReactFlow
    </div>
  )),
  ReactFlowProvider: vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>),
  useReactFlow: vi.fn(() => ({ fitView: vi.fn() })),
}));

// Mock elkjs - must be a class for `new ELK()`
vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout = vi.fn(async (graph: { children: { id: string }[] }) => ({
      children: graph.children.map((c: { id: string }, i: number) => ({
        id: c.id,
        x: i * 200,
        y: i * 100,
      })),
    }));
  },
}));

describe('TaskDAG', () => {
  it('returns null when no tasks', () => {
    const { container } = render(<TaskDAG tasks={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders ReactFlow when tasks are provided', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('renders with multiple tasks and dependencies', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Plan', description: '', status: 'done', agent_name: 'Planner', dependencies: [] },
      { id: '2', name: 'Build', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: ['1'] },
      { id: '3', name: 'Test', description: '', status: 'pending', agent_name: 'Tester', dependencies: ['2'] },
    ];
    render(<TaskDAG tasks={tasks} />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('accepts optional agents prop', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
    ];
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'working' },
    ];
    render(<TaskDAG tasks={tasks} agents={agents} />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} className="h-full" />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
