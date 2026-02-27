import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlueprintCanvas from './BlueprintCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'blueprint', data: {} },
  onCanvasUpdate: vi.fn(),
};

const sampleTasks = [
  { id: 't1', name: 'Build game board', agent: 'Builder Bot', status: 'done', acceptance_criteria: 'Grid renders at 800x600' },
  { id: 't2', name: 'Add snake movement', agent: 'Builder Bot', status: 'done' },
  { id: 't3', name: 'Add collision detection', agent: 'Builder Bot', status: 'failed' },
  { id: 't4', name: 'Write tests', agent: 'Test Bot', status: 'pending' },
];

const sampleRequirements = [
  { id: 'r1', description: 'When user presses arrow key, snake moves', verified: 'passing' },
  { id: 'r2', description: 'When snake hits wall, game ends', verified: 'failing' },
  { id: 'r3', description: 'It should keep score', verified: 'untested' },
];

const sampleStats = {
  total_tasks: 4,
  tasks_done: 2,
  tests_passing: 3,
  tests_total: 5,
  health_score: 72,
};

const fullData = {
  tasks: sampleTasks,
  requirements: sampleRequirements,
  ...sampleStats,
};

describe('BlueprintCanvas', () => {
  it('renders the heading and description', () => {
    render(<BlueprintCanvas {...defaultProps} />);
    expect(screen.getByText('System Blueprint')).toBeInTheDocument();
    expect(screen.getByText("Here's how your project was built. Click a task to learn more!")).toBeInTheDocument();
  });

  it('shows waiting message when no task data is provided', () => {
    render(<BlueprintCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for Blueprint to share the task overview...')).toBeInTheDocument();
  });

  it('shows no requirements message when none provided', () => {
    render(<BlueprintCanvas {...defaultProps} />);
    expect(screen.getByText('No requirements data yet.')).toBeInTheDocument();
  });

  it('displays tasks from canvas state', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('Build game board')).toBeInTheDocument();
    expect(screen.getByText('Add snake movement')).toBeInTheDocument();
    expect(screen.getByText('Add collision detection')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('displays task status badges', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getAllByText('done')).toHaveLength(2);
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('displays task agent names', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    // Builder Bot appears on 3 tasks, Test Bot on 1
    expect(screen.getAllByText('Builder Bot')).toHaveLength(3);
    expect(screen.getByText('Test Bot')).toBeInTheDocument();
  });

  it('displays requirements with status dots', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('When user presses arrow key, snake moves')).toBeInTheDocument();
    expect(screen.getByText('When snake hits wall, game ends')).toBeInTheDocument();
    expect(screen.getByText('It should keep score')).toBeInTheDocument();

    expect(screen.getByLabelText('Status: passing')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: failing')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: untested')).toBeInTheDocument();
  });

  it('displays system stats', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Tasks Done')).toBeInTheDocument();
    expect(screen.getByText('Tests Passing')).toBeInTheDocument();
    expect(screen.getByText('Health Score')).toBeInTheDocument();
  });

  it('clicking a task shows its details', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    fireEvent.click(screen.getByLabelText('View task: Build game board'));

    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
    expect(screen.getByText('Grid renders at 800x600')).toBeInTheDocument();
  });

  it('clicking a selected task deselects it', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    const taskButton = screen.getByLabelText('View task: Build game board');
    fireEvent.click(taskButton);
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();

    fireEvent.click(taskButton);
    expect(screen.queryByTestId('task-detail')).not.toBeInTheDocument();
  });

  it('task detail shows agent name', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    fireEvent.click(screen.getByLabelText('View task: Build game board'));
    expect(screen.getByText('Agent: Builder Bot')).toBeInTheDocument();
  });

  it('selected task button has accent highlight', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    const taskButton = screen.getByLabelText('View task: Build game board');
    fireEvent.click(taskButton);

    expect(taskButton.className).toContain('border-accent-sky');
    expect(taskButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not show stats section when no stats in data', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: { tasks: sampleTasks, requirements: sampleRequirements } }}
      />,
    );

    expect(screen.queryByTestId('system-stats')).not.toBeInTheDocument();
  });
});
