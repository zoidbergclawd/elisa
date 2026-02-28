import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MissionControlPanel from './MissionControlPanel';
import type { Task, Agent, WSEvent, NarratorMessage, UIState } from '../../types';

vi.mock('./TaskDAG', () => ({
  default: vi.fn(({ tasks }: { tasks: Task[] }) => (
    <div data-testid="task-dag">TaskDAG ({tasks.length} tasks)</div>
  )),
}));

vi.mock('./MinionSquadPanel', () => ({
  default: vi.fn(({ agents }: { agents: Agent[] }) => (
    <div data-testid="minion-squad">MinionSquad ({agents.length} agents)</div>
  )),
}));

vi.mock('./NarratorFeed', () => ({
  default: vi.fn(() => <div data-testid="narrator-feed">NarratorFeed</div>),
}));

vi.mock('../shared/ImpactPreview', () => ({
  default: vi.fn(({ estimate }: { estimate: { estimated_tasks: number; complexity: string } }) => (
    <div data-testid="impact-preview">ImpactPreview (~{estimate.estimated_tasks} tasks, {estimate.complexity})</div>
  )),
}));

const defaultProps = {
  tasks: [] as Task[],
  agents: [] as Agent[],
  events: [] as WSEvent[],
  narratorMessages: [] as NarratorMessage[],
  spec: null,
  uiState: 'design' as UIState,
};

describe('MissionControlPanel', () => {
  it('renders without crashing', () => {
    render(<MissionControlPanel {...defaultProps} />);
    expect(screen.getByTestId('minion-squad')).toBeInTheDocument();
    expect(screen.getByTestId('narrator-feed')).toBeInTheDocument();
  });

  it('shows empty state message when no tasks', () => {
    render(<MissionControlPanel {...defaultProps} />);
    expect(screen.getByText(/Mission Control will light up/)).toBeInTheDocument();
  });

  it('renders TaskDAG when tasks are present', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    render(<MissionControlPanel {...defaultProps} tasks={tasks} />);
    expect(screen.getByTestId('task-dag')).toBeInTheDocument();
    expect(screen.getByText('TaskDAG (1 tasks)')).toBeInTheDocument();
  });

  it('passes agents to MinionSquadPanel', () => {
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'idle' },
      { name: 'Tester', role: 'tester', persona: '', status: 'working' },
    ];
    render(<MissionControlPanel {...defaultProps} agents={agents} />);
    expect(screen.getByText('MinionSquad (2 agents)')).toBeInTheDocument();
  });

  it('renders NarratorFeed subcomponent', () => {
    render(<MissionControlPanel {...defaultProps} />);
    expect(screen.getByTestId('narrator-feed')).toBeInTheDocument();
  });

  // --- ImpactPreview integration ---

  it('renders ImpactPreview when isPlanning=true and impactEstimate is provided', () => {
    const impactEstimate = {
      estimated_tasks: 5,
      complexity: 'moderate' as const,
      heaviest_requirements: ['Build game board'],
    };
    render(
      <MissionControlPanel
        {...defaultProps}
        isPlanning={true}
        impactEstimate={impactEstimate}
      />,
    );
    expect(screen.getByTestId('impact-preview')).toBeInTheDocument();
    expect(screen.getByText(/~5 tasks/)).toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when isPlanning=false', () => {
    const impactEstimate = {
      estimated_tasks: 5,
      complexity: 'moderate' as const,
      heaviest_requirements: ['Build game board'],
    };
    render(
      <MissionControlPanel
        {...defaultProps}
        isPlanning={false}
        impactEstimate={impactEstimate}
      />,
    );
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when impactEstimate is null', () => {
    render(
      <MissionControlPanel
        {...defaultProps}
        isPlanning={true}
        impactEstimate={null}
      />,
    );
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when impactEstimate is undefined (default)', () => {
    render(
      <MissionControlPanel
        {...defaultProps}
        isPlanning={true}
      />,
    );
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });
});
