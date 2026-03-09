import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlueprintCanvas from './BlueprintCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'blueprint', data: {} },
  onCanvasUpdate: vi.fn(),
};

const sampleTasks = [
  { id: 't1', name: 'Build game board', agent: 'Builder Bot', status: 'done', description: 'Create the main game grid', acceptance_criteria: 'Grid renders at 800x600' },
  { id: 't2', name: 'Add snake movement', agent: 'Builder Bot', status: 'done' },
  { id: 't3', name: 'Add collision detection', agent: 'Builder Bot', status: 'failed' },
  { id: 't4', name: 'Write tests', agent: 'Test Bot', status: 'pending' },
  { id: 't5', name: 'Score tracker', agent: 'Builder Bot', status: 'running' },
];

const sampleTests = [
  { name: 'test_snake_moves_on_arrow_key', passed: true },
  { name: 'test_game_ends_on_wall_hit', passed: false },
  { name: 'test_score_increments', passed: true },
  { name: 'test_board_renders', passed: true },
];

const sampleStats = {
  total_tasks: 5,
  tasks_done: 2,
  tests_passing: 3,
  tests_total: 4,
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
    expect(screen.getByText('Build Explorer')).toBeInTheDocument();
    expect(screen.getByText("Here's how your project was built. Click a task to explore!")).toBeInTheDocument();
  });

  it('shows waiting message when no task data is provided', () => {
    render(<BlueprintCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for Blueprint to share the task overview...')).toBeInTheDocument();
  });

  it('shows empty detail prompt when no task is selected', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );
    expect(screen.getByTestId('empty-detail')).toBeInTheDocument();
    expect(screen.getByText('Click a task to explore how it was built')).toBeInTheDocument();
  });

  it('displays all tasks from canvas state', () => {
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
    expect(screen.getByText('Score tracker')).toBeInTheDocument();
  });

  it('displays status badges with correct labels', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getAllByText('done')).toHaveLength(2);
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('displays task agent names in the task list', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    // Builder Bot appears on 4 tasks, Test Bot on 1
    expect(screen.getAllByText('Builder Bot')).toHaveLength(4);
    expect(screen.getByText('Test Bot')).toBeInTheDocument();
  });

  it('displays system stats', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Tasks Done')).toBeInTheDocument();
    expect(screen.getByText('Tests Passing')).toBeInTheDocument();
    expect(screen.getByText('Health Score')).toBeInTheDocument();
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

  it('clicking a task shows its details in the right panel', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    fireEvent.click(screen.getByLabelText('View task: Build game board'));

    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
    // Empty detail prompt should be gone
    expect(screen.queryByTestId('empty-detail')).not.toBeInTheDocument();
  });

  it('task detail shows name, status, agent, description, and acceptance criteria', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    fireEvent.click(screen.getByLabelText('View task: Build game board'));

    expect(screen.getByText('Create the main game grid')).toBeInTheDocument();
    expect(screen.getByText('Grid renders at 800x600')).toBeInTheDocument();
    // Agent shown in detail panel
    expect(screen.getByText('Agent: Builder Bot')).toBeInTheDocument();
  });

  it('task detail shows related tests filtered by task name keywords', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    // "Build game board" -> keyword "board" matches "test_board_renders"
    fireEvent.click(screen.getByLabelText('View task: Build game board'));

    const detail = screen.getByTestId('task-detail');
    expect(detail).toHaveTextContent('test_board_renders');
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
    expect(screen.getByTestId('empty-detail')).toBeInTheDocument();
  });

  it('selected task button has accent highlight and aria-pressed', () => {
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

  it('shows "No matching tests found" when selected task has no related tests', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    // "Write tests" -- keyword "write" doesn't match any test names
    fireEvent.click(screen.getByLabelText('View task: Write tests'));

    expect(screen.getByText('No matching tests found.')).toBeInTheDocument();
  });

  it('switching between tasks updates the detail panel', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );

    fireEvent.click(screen.getByLabelText('View task: Build game board'));
    expect(screen.getByText('Create the main game grid')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('View task: Add snake movement'));
    expect(screen.queryByText('Create the main game grid')).not.toBeInTheDocument();
  });

  it('shows HealthGradeCard when health_grade and health_breakdown present', () => {
    const dataWithHealth = {
      ...fullData,
      health_grade: 'A',
      health_score: 92,
      health_breakdown: { tasks_score: 28, tests_score: 38, corrections_score: 16, budget_score: 10 },
    };
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: dataWithHealth }}
      />,
    );
    expect(screen.getByTestId('health-grade-section')).toBeInTheDocument();
    expect(screen.getByTestId('health-grade-card')).toBeInTheDocument();
    // Old stats bar should not be shown
    expect(screen.queryByTestId('system-stats')).not.toBeInTheDocument();
  });

  it('falls back to old stats bar when no health grade/breakdown', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );
    expect(screen.getByTestId('system-stats')).toBeInTheDocument();
    expect(screen.queryByTestId('health-grade-section')).not.toBeInTheDocument();
  });

  it('renders architecture summary when complexity present', () => {
    const dataWithArch = {
      ...fullData,
      complexity: 'moderate',
      system_inputs: [{ name: 'keyboard', type: 'user_input' }],
      system_outputs: [{ name: 'display', type: 'visual' }, { name: 'sound', type: 'audio' }],
    };
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: dataWithArch }}
      />,
    );
    const summary = screen.getByTestId('architecture-summary');
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent('moderate');
    expect(summary).toHaveTextContent('1 input');
    expect(summary).toHaveTextContent('2 outputs');
  });

  it('hides architecture summary when no complexity data', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );
    expect(screen.queryByTestId('architecture-summary')).not.toBeInTheDocument();
  });

  it('renders failing tests banner when tests have failures', () => {
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: fullData }}
      />,
    );
    // sampleTests has 1 failing test
    const banner = screen.getByTestId('failing-tests-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Failing Tests (1)');
    expect(banner).toHaveTextContent('test_game_ends_on_wall_hit');
  });

  it('shows test error details in failing tests banner', () => {
    const dataWithDetails = {
      ...fullData,
      tests: [
        { name: 'test_snake_moves', passed: true },
        { name: 'test_wall_hit', passed: false, details: 'AssertionError: expected True got False' },
      ],
    };
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: dataWithDetails }}
      />,
    );
    const banner = screen.getByTestId('failing-tests-banner');
    expect(banner).toHaveTextContent('AssertionError: expected True got False');
  });

  it('hides failing tests banner when all tests pass', () => {
    const allPassing = {
      ...fullData,
      tests: [
        { name: 'test_a', passed: true },
        { name: 'test_b', passed: true },
      ],
    };
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: allPassing }}
      />,
    );
    expect(screen.queryByTestId('failing-tests-banner')).not.toBeInTheDocument();
  });

  it('shows error details in task detail for failing related tests', () => {
    const dataWithDetails = {
      ...fullData,
      tests: [
        { name: 'test_board_renders', passed: false, details: 'ModuleNotFoundError: no module board' },
      ],
    };
    render(
      <BlueprintCanvas
        {...defaultProps}
        canvasState={{ type: 'blueprint', data: dataWithDetails }}
      />,
    );
    // Click "Build game board" -> keyword "board" matches "test_board_renders"
    fireEvent.click(screen.getByLabelText('View task: Build game board'));
    const detail = screen.getByTestId('task-detail');
    expect(detail).toHaveTextContent('ModuleNotFoundError: no module board');
  });
});
