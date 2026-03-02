import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BugDetectiveCanvas from './BugDetectiveCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'bug-detective', data: {} },
  onCanvasUpdate: vi.fn(),
};

const failingTestData = {
  test_name: 'test_collision_ends_game',
  when: 'the snake hits the wall',
  then_expected: 'the game ends and shows score',
  then_actual: 'the snake wraps around to the other side',
  diagnosis_notes: [
    'The collision function checks boundaries but returns false',
    'The game loop does not call endGame() when collision is true',
  ],
};

describe('BugDetectiveCanvas', () => {
  it('renders the heading and description', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByText('Bug Detective')).toBeInTheDocument();
    expect(screen.getByText("Let's figure out what went wrong and how to fix it!")).toBeInTheDocument();
  });

  it('shows waiting message when no test data is provided', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for test details...')).toBeInTheDocument();
  });

  it('shows diagnosis placeholder when no notes are available', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByText('The detective is investigating...')).toBeInTheDocument();
  });

  it('displays failing test details from canvas state', () => {
    render(
      <BugDetectiveCanvas
        {...defaultProps}
        canvasState={{ type: 'bug-detective', data: failingTestData }}
      />,
    );

    expect(screen.getByText('test_collision_ends_game')).toBeInTheDocument();
    expect(screen.getByText('the snake hits the wall')).toBeInTheDocument();
    expect(screen.getByText('the game ends and shows score')).toBeInTheDocument();
    expect(screen.getByText('the snake wraps around to the other side')).toBeInTheDocument();
  });

  it('shows Expected and Actual labels', () => {
    render(
      <BugDetectiveCanvas
        {...defaultProps}
        canvasState={{ type: 'bug-detective', data: failingTestData }}
      />,
    );

    expect(screen.getByText('Expected')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('shows When label for when clause', () => {
    render(
      <BugDetectiveCanvas
        {...defaultProps}
        canvasState={{ type: 'bug-detective', data: failingTestData }}
      />,
    );

    expect(screen.getByText('When')).toBeInTheDocument();
  });

  it('displays diagnosis notes from canvas state', () => {
    render(
      <BugDetectiveCanvas
        {...defaultProps}
        canvasState={{ type: 'bug-detective', data: failingTestData }}
      />,
    );

    expect(screen.getByText('The collision function checks boundaries but returns false')).toBeInTheDocument();
    expect(screen.getByText('The game loop does not call endGame() when collision is true')).toBeInTheDocument();
  });

  it('renders the fix decision textarea', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByLabelText('Fix decision')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe the fix you think will work...')).toBeInTheDocument();
  });

  it('renders the Submit Fix button', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByText('Submit Fix')).toBeInTheDocument();
  });

  it('Submit Fix button is disabled when textarea is empty', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    const button = screen.getByText('Submit Fix');
    expect(button).toBeDisabled();
  });

  it('Submit Fix button enables when text is entered', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);

    const textarea = screen.getByLabelText('Fix decision');
    fireEvent.change(textarea, { target: { value: 'Fix the collision check' } });

    const button = screen.getByText('Submit Fix');
    expect(button).not.toBeDisabled();
  });

  it('Submit Fix calls onCanvasUpdate with fix_decision', () => {
    const onCanvasUpdate = vi.fn();
    render(<BugDetectiveCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    const textarea = screen.getByLabelText('Fix decision');
    fireEvent.change(textarea, { target: { value: 'Fix the collision check' } });
    fireEvent.click(screen.getByText('Submit Fix'));

    expect(onCanvasUpdate).toHaveBeenCalledWith({
      type: 'fix_decision',
      fix: 'Fix the collision check',
    });
  });

  it('does not submit when textarea has only whitespace', () => {
    const onCanvasUpdate = vi.fn();
    render(<BugDetectiveCanvas {...defaultProps} onCanvasUpdate={onCanvasUpdate} />);

    const textarea = screen.getByLabelText('Fix decision');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Submit Fix'));

    expect(onCanvasUpdate).not.toHaveBeenCalled();
  });

  it('shows the prompt label for fix decision', () => {
    render(<BugDetectiveCanvas {...defaultProps} />);
    expect(screen.getByText('What do you think should change?')).toBeInTheDocument();
  });
});
