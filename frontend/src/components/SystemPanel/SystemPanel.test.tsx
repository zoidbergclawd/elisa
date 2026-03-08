import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SystemPanel from './SystemPanel';
import { defaultBuildSessionValue } from '../../test-utils/renderWithProviders';
import { defaultWorkspaceValue } from '../../test-utils/renderWithProviders';

vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => defaultBuildSessionValue),
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspaceContext: vi.fn(() => defaultWorkspaceValue),
}));

import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';

const mockSpec = {
  nugget: { goal: 'Build a weather app', description: 'A simple weather display', type: 'web' },
  requirements: [
    { type: 'functional', description: 'Show current temperature' },
    { type: 'visual', description: 'Dark theme UI' },
  ],
  agents: [{ name: 'Builder Bot', role: 'builder', persona: 'Helpful' }],
  deployment: { target: 'web', auto_flash: false },
  workflow: { review_enabled: false, testing_enabled: true, human_gates: [] },
  portals: [{ id: 'p1', name: 'Weather API', description: 'Fetches weather', mechanism: 'rest', capabilities: [], interactions: [] }],
};

const mockTasks = [
  { id: 't1', name: 'Setup project', description: 'Initialize the project', status: 'done' as const, agent_name: 'Builder Bot', dependencies: [] },
  { id: 't2', name: 'Add UI', description: 'Build the interface', status: 'in_progress' as const, agent_name: 'Builder Bot', dependencies: ['t1'] },
  { id: 't3', name: 'Write tests', description: 'Add test coverage', status: 'pending' as const, agent_name: 'Test Bot', dependencies: ['t2'] },
  { id: 't4', name: 'Fix styling', description: 'Fix broken CSS', status: 'failed' as const, agent_name: 'Builder Bot', dependencies: [] },
];

const mockTestResults = [
  { test_name: 'Setup project init test', passed: true, details: 'OK', status: 'passed' as const },
  { test_name: 'Add UI render test', passed: false, details: 'Failed to render', status: 'failed' as const },
];

describe('SystemPanel', () => {
  it('renders empty state when no spec and no tasks', () => {
    render(<SystemPanel />);
    expect(screen.getByTestId('system-empty')).toBeInTheDocument();
    expect(screen.getByText(/Architecture overview will appear/)).toBeInTheDocument();
  });

  it('renders spec view during design phase when spec is available', () => {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      spec: mockSpec,
    });

    render(<SystemPanel />);
    expect(screen.getByTestId('system-spec')).toBeInTheDocument();
    expect(screen.getByText('Build a weather app')).toBeInTheDocument();
    expect(screen.getByText('A simple weather display')).toBeInTheDocument();
    expect(screen.getByTestId('spec-view')).toBeInTheDocument();
  });

  it('shows requirements in spec view', () => {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      spec: mockSpec,
    });

    render(<SystemPanel />);
    expect(screen.getByText('Show current temperature')).toBeInTheDocument();
    expect(screen.getByText('Dark theme UI')).toBeInTheDocument();
    expect(screen.getByText('Requirements (2)')).toBeInTheDocument();
  });

  it('shows agents in spec view', () => {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      spec: mockSpec,
    });

    render(<SystemPanel />);
    expect(screen.getByText(/Builder Bot/)).toBeInTheDocument();
    expect(screen.getByText('Agents (1)')).toBeInTheDocument();
  });

  it('shows portals in spec view', () => {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      ...defaultWorkspaceValue,
      spec: mockSpec,
    });

    render(<SystemPanel />);
    expect(screen.getByText('Weather API')).toBeInTheDocument();
    expect(screen.getByText('Portals (1)')).toBeInTheDocument();
  });

  it('renders architecture explorer when tasks exist', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByTestId('system-architecture')).toBeInTheDocument();
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument();
  });

  it('shows task list with status badges', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByText('Setup project')).toBeInTheDocument();
    expect(screen.getByText('Add UI')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Fix styling')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows summary bar with task and test counts', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      testResults: mockTestResults,
      uiState: 'done',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByText('1/4')).toBeInTheDocument(); // 1 done out of 4
    expect(screen.getByText('1/2')).toBeInTheDocument(); // 1 passing out of 2
  });

  it('shows health score when healthUpdate is available', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      healthUpdate: { tasks_done: 3, tasks_total: 4, tests_passing: 5, tests_total: 6, tokens_used: 1000, health_score: 85 },
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('5/6')).toBeInTheDocument();
  });

  it('shows "Select a task" prompt when no task is selected', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByTestId('select-task-prompt')).toBeInTheDocument();
    expect(screen.getByText('Select a task to view details')).toBeInTheDocument();
  });

  it('shows task detail when a task is clicked', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      testResults: mockTestResults,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    fireEvent.click(screen.getByTestId('task-card-t1'));
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
    expect(screen.getByText('Initialize the project')).toBeInTheDocument();
    // Agent name appears in both the task card and the detail panel
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('shows related test results in task detail', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      testResults: mockTestResults,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    fireEvent.click(screen.getByTestId('task-card-t1'));
    expect(screen.getByText('Setup project init test')).toBeInTheDocument();
  });

  it('shows dependencies in task detail', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    fireEvent.click(screen.getByTestId('task-card-t2'));
    expect(screen.getByText('t1')).toBeInTheDocument();
  });

  it('deselects task when clicking the same task again', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    fireEvent.click(screen.getByTestId('task-card-t1'));
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('task-card-t1'));
    expect(screen.getByTestId('select-task-prompt')).toBeInTheDocument();
  });

  it('shows tasks heading with count', () => {
    vi.mocked(useBuildSessionContext).mockReturnValue({
      ...defaultBuildSessionValue,
      tasks: mockTasks,
      uiState: 'building',
    });
    vi.mocked(useWorkspaceContext).mockReturnValue(defaultWorkspaceValue);

    render(<SystemPanel />);
    expect(screen.getByText('Tasks (4)')).toBeInTheDocument();
  });
});
