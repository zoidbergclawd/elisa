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

const sampleTests = [
  { name: 'test_snake_moves_on_arrow_key', passed: true },
  { name: 'test_game_ends_on_wall_hit', passed: false },
  { name: 'test_score_increments', passed: true },
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
  tests: sampleTests,
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

  it('shows no test data message when none provided', () => {
    render(<BlueprintCanvas {...defaultProps} />);
    expect(screen.getByText('No test data yet.')).toBeInTheDocument();
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

  it('displays tests with pass/fail indicators', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('test_snake_moves_on_arrow_key')).toBeInTheDocument();
    expect(screen.getByText('test_game_ends_on_wall_hit')).toBeInTheDocument();
    expect(screen.getByText('test_score_increments')).toBeInTheDocument();

    expect(screen.getAllByLabelText('Test: Passed')).toHaveLength(2);
    expect(screen.getByLabelText('Test: Failed')).toBeInTheDocument();
  });

  it('shows Tests Written column header', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('Tests Written')).toBeInTheDocument();
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
        canvasState={{ type: 'blueprint', data: { tasks: sampleTasks, tests: sampleTests } }}
      />,
    );

    expect(screen.queryByTestId('system-stats')).not.toBeInTheDocument();
  });
});
