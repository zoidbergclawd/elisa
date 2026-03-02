import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MissionControlPanel from './MissionControlPanel';
import type { Task, Agent } from '../../types';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { defaultBuildSessionValue, defaultWorkspaceValue } from '../../test-utils/renderWithProviders';

vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspaceContext: vi.fn(() => defaultWorkspaceValue),
}));

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

function renderPanel(overrides?: {
  buildSession?: Partial<typeof defaultBuildSessionValue>;
  workspace?: Partial<typeof defaultWorkspaceValue>;
}) {
  if (overrides?.buildSession) {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      ...overrides.buildSession,
    });
  } else {
    vi.mocked(useBuildSessionContext).mockReturnValue({ ...defaultBuildSessionValue });
  }
  if (overrides?.workspace) {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      ...overrides.workspace,
    });
  } else {
    vi.mocked(useWorkspaceContext).mockReturnValue({ ...defaultWorkspaceValue });
  }
  return render(<MissionControlPanel />);
}

describe('MissionControlPanel', () => {
  it('renders without crashing', () => {
    renderPanel();
    expect(screen.getByTestId('minion-squad')).toBeInTheDocument();
    expect(screen.getByTestId('narrator-feed')).toBeInTheDocument();
  });

  it('shows empty state message when no tasks', () => {
    renderPanel();
    expect(screen.getByText(/Mission Control will light up/)).toBeInTheDocument();
  });

  it('renders TaskDAG when tasks are present', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'pending', agent_name: 'Builder', dependencies: [] },
    ];
    renderPanel({ buildSession: { tasks } });
    expect(screen.getByTestId('task-dag')).toBeInTheDocument();
    expect(screen.getByText('TaskDAG (1 tasks)')).toBeInTheDocument();
  });

  it('passes agents to MinionSquadPanel', () => {
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'idle' },
      { name: 'Tester', role: 'tester', persona: '', status: 'working' },
    ];
    renderPanel({ buildSession: { agents } });
    expect(screen.getByText('MinionSquad (2 agents)')).toBeInTheDocument();
  });

  it('renders NarratorFeed subcomponent', () => {
    renderPanel();
    expect(screen.getByTestId('narrator-feed')).toBeInTheDocument();
  });

  // --- ImpactPreview integration ---

  it('renders ImpactPreview when isPlanning=true and impactEstimate is provided', () => {
    const impactEstimate = {
      estimated_tasks: 5,
      complexity: 'moderate' as const,
      heaviest_requirements: ['Build game board'],
    };
    renderPanel({ buildSession: { isPlanning: true, impactEstimate } });
    expect(screen.getByTestId('impact-preview')).toBeInTheDocument();
    expect(screen.getByText(/~5 tasks/)).toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when isPlanning=false', () => {
    const impactEstimate = {
      estimated_tasks: 5,
      complexity: 'moderate' as const,
      heaviest_requirements: ['Build game board'],
    };
    renderPanel({ buildSession: { isPlanning: false, impactEstimate } });
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when impactEstimate is null', () => {
    renderPanel({ buildSession: { isPlanning: true, impactEstimate: null } });
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });

  it('does NOT render ImpactPreview when impactEstimate is undefined (default)', () => {
    renderPanel({ buildSession: { isPlanning: true } });
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument();
  });
});
