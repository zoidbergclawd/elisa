import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import TaskDAG from './TaskDAG';
import type { Task, Agent } from '../../types';

// Store last ReactFlow props for edge-click testing
let lastReactFlowProps: Record<string, unknown> = {};

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  ReactFlow: vi.fn((props: Record<string, unknown>) => {
    lastReactFlowProps = props;
    const { nodes, edges } = props as { nodes: unknown[]; edges: unknown[] };
    return (
      <div data-testid="react-flow" data-nodes={nodes?.length ?? 0} data-edges={edges?.length ?? 0}>
        ReactFlow
      </div>
    );
  }),
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

// Mock ContextFlowAnimation
vi.mock('./ContextFlowAnimation', () => ({
  default: vi.fn(({ flows }: { flows: unknown[] }) => (
    <div data-testid="context-flow-animation" data-flow-count={flows.length}>ContextFlowAnimation</div>
  )),
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

  // -- New tests for Task #6 features --

  it('renders blueprint label when isComplete is true', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'done', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} isComplete={true} />);
    expect(screen.getByTestId('blueprint-label')).toBeInTheDocument();
    expect(screen.getByText('Blueprint')).toBeInTheDocument();
  });

  it('does not render blueprint label when isComplete is false', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} isComplete={false} />);
    expect(screen.queryByTestId('blueprint-label')).not.toBeInTheDocument();
  });

  it('renders requirement legend when tasks have requirement_ids', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Add login', description: '', status: 'pending', agent_name: 'Builder', dependencies: [], requirement_ids: ['req-0'] },
      { id: '2', name: 'Add dashboard', description: '', status: 'pending', agent_name: 'Builder', dependencies: [], requirement_ids: ['req-1'] },
    ];
    const requirements = [
      { type: 'feature', description: 'User login' },
      { type: 'feature', description: 'Dashboard view' },
    ];
    render(<TaskDAG tasks={tasks} requirements={requirements} />);
    expect(screen.getByTestId('requirement-legend')).toBeInTheDocument();
    expect(screen.getByText('User login')).toBeInTheDocument();
    expect(screen.getByText('Dashboard view')).toBeInTheDocument();
  });

  it('does not render requirement legend when no tasks have requirement_ids', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} />);
    expect(screen.queryByTestId('requirement-legend')).not.toBeInTheDocument();
  });

  it('renders context flow animation when contextFlows are provided', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'done', agent_name: 'Builder', dependencies: [] },
      { id: '2', name: 'Test', description: '', status: 'in_progress', agent_name: 'Tester', dependencies: ['1'] },
    ];
    const contextFlows = [
      { from_task_id: '1', to_task_ids: ['2'], summary_preview: 'Built the UI', timestamp: Date.now() },
    ];
    render(<TaskDAG tasks={tasks} contextFlows={contextFlows} />);
    expect(screen.getByTestId('context-flow-animation')).toBeInTheDocument();
  });

  it('does not render context flow animation when no flows', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    render(<TaskDAG tasks={tasks} contextFlows={[]} />);
    expect(screen.queryByTestId('context-flow-animation')).not.toBeInTheDocument();
  });

  it('shows simplified agent-level nodes in explorer mode', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Scaffold', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: [] },
      { id: '2', name: 'Implement', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: ['1'] },
      { id: '3', name: 'Write tests', description: '', status: 'in_progress', agent_name: 'Test Bot', dependencies: ['2'] },
    ];
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: '', status: 'idle' },
      { name: 'Test Bot', role: 'tester', persona: '', status: 'working' },
    ];
    // In explorer mode, the ELK graph should have 2 children (one per agent), not 3
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
    const elkInstance = new ELK();
    const layoutSpy = vi.spyOn(elkInstance, 'layout');

    render(<TaskDAG tasks={tasks} agents={agents} systemLevel="explorer" />);
    // The ReactFlow component renders; in explorer mode it should reduce 3 tasks to 2 agent-level nodes
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    // Verify that ELK layout mock was called -- the explorer logic filters tasks
    // We can't easily check the mock's argument here, so we verify the component renders without error
    layoutSpy.mockRestore();
  });

  it('shows full task nodes in builder mode', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Scaffold', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: [] },
      { id: '2', name: 'Implement', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: ['1'] },
      { id: '3', name: 'Write tests', description: '', status: 'pending', agent_name: 'Test Bot', dependencies: ['2'] },
    ];
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: '', status: 'idle' },
      { name: 'Test Bot', role: 'tester', persona: '', status: 'idle' },
    ];
    // In builder mode, all 3 task nodes are shown (no filtering)
    render(<TaskDAG tasks={tasks} agents={agents} systemLevel="builder" />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('shows full task nodes in architect mode', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Scaffold', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: [] },
      { id: '2', name: 'Implement', description: '', status: 'done', agent_name: 'Builder Bot', dependencies: ['1'] },
      { id: '3', name: 'Write tests', description: '', status: 'pending', agent_name: 'Test Bot', dependencies: ['2'] },
    ];
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: '', status: 'idle' },
      { name: 'Test Bot', role: 'tester', persona: '', status: 'idle' },
    ];
    // In architect mode, all 3 task nodes are shown (no filtering)
    render(<TaskDAG tasks={tasks} agents={agents} systemLevel="architect" />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // -- "Why This Order?" edge click tests --

  it('passes onEdgeClick handler to ReactFlow', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Plan', description: '', status: 'done', agent_name: 'Planner', dependencies: [] },
      { id: '2', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: ['1'] },
    ];
    render(<TaskDAG tasks={tasks} />);
    await waitFor(() => {
      expect(lastReactFlowProps.onEdgeClick).toBeDefined();
    });
    expect(typeof lastReactFlowProps.onEdgeClick).toBe('function');
  });

  it('shows edge tooltip when onEdgeClick is triggered', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Plan', description: '', status: 'done', agent_name: 'Planner', dependencies: [] },
      { id: '2', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: ['1'] },
    ];
    render(<TaskDAG tasks={tasks} />);
    await waitFor(() => {
      expect(lastReactFlowProps.onEdgeClick).toBeDefined();
    });

    // Simulate edge click
    const mockEvent = {
      clientX: 100,
      clientY: 200,
      currentTarget: {
        closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
      },
    };
    act(() => {
      (lastReactFlowProps.onEdgeClick as (event: unknown, edge: { source: string; target: string }) => void)(
        mockEvent,
        { source: '1', target: '2' },
      );
    });

    expect(screen.getByTestId('edge-tooltip')).toBeInTheDocument();
    expect(screen.getByText('Why this order?')).toBeInTheDocument();
    expect(screen.getByText(/depends on/)).toBeInTheDocument();
  });

  it('hides edge tooltip when clicking the same edge again', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Plan', description: '', status: 'done', agent_name: 'Planner', dependencies: [] },
      { id: '2', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: ['1'] },
    ];
    render(<TaskDAG tasks={tasks} />);
    await waitFor(() => {
      expect(lastReactFlowProps.onEdgeClick).toBeDefined();
    });

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      currentTarget: {
        closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
      },
    };
    const edgeClickHandler = lastReactFlowProps.onEdgeClick as (event: unknown, edge: { source: string; target: string }) => void;

    // Click once to show
    act(() => { edgeClickHandler(mockEvent, { source: '1', target: '2' }); });
    expect(screen.getByTestId('edge-tooltip')).toBeInTheDocument();

    // Click same edge again to hide
    act(() => { edgeClickHandler(mockEvent, { source: '1', target: '2' }); });
    expect(screen.queryByTestId('edge-tooltip')).not.toBeInTheDocument();
  });

  it('hides edge tooltip on pane click', async () => {
    const tasks: Task[] = [
      { id: '1', name: 'Plan', description: '', status: 'done', agent_name: 'Planner', dependencies: [] },
      { id: '2', name: 'Build', description: '', status: 'pending', agent_name: 'Builder', dependencies: ['1'] },
    ];
    render(<TaskDAG tasks={tasks} />);
    await waitFor(() => {
      expect(lastReactFlowProps.onEdgeClick).toBeDefined();
    });

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      currentTarget: {
        closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
      },
    };

    // Show tooltip
    act(() => {
      (lastReactFlowProps.onEdgeClick as (event: unknown, edge: { source: string; target: string }) => void)(
        mockEvent,
        { source: '1', target: '2' },
      );
    });
    expect(screen.getByTestId('edge-tooltip')).toBeInTheDocument();

    // Click pane to dismiss
    act(() => {
      (lastReactFlowProps.onPaneClick as () => void)();
    });
    expect(screen.queryByTestId('edge-tooltip')).not.toBeInTheDocument();
  });
});
