import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionModal from './QuestionModal';
import type { QuestionPayload } from '../../types';

// Mock authFetch at module level
const mockAuthFetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
vi.mock('../../lib/apiClient', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

const singleSelectQuestion: QuestionPayload = {
  question: 'What color do you want?',
  header: 'color_choice',
  options: [
    { label: 'Red', description: 'A warm color' },
    { label: 'Blue', description: 'A cool color' },
  ],
  multiSelect: false,
};

const multiSelectQuestion: QuestionPayload = {
  question: 'Which features do you want?',
  header: 'features',
  options: [
    { label: 'Dark mode', description: 'Enable dark theme' },
    { label: 'Animations', description: 'Enable animations' },
  ],
  multiSelect: true,
};

const defaultProps = {
  taskId: 'task-1',
  sessionId: 'session-123',
  onClose: vi.fn(),
};

beforeEach(() => {
  defaultProps.onClose = vi.fn();
  mockAuthFetch.mockClear();
  mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
});

describe('QuestionModal', () => {
  it('renders the modal title', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('Your helpers have a question')).toBeInTheDocument();
  });

  it('has dialog role and aria attributes', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders question text and header', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('What color do you want?')).toBeInTheDocument();
    expect(screen.getByText('color_choice')).toBeInTheDocument();
  });

  it('renders all options for a single-select question', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('A warm color')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('A cool color')).toBeInTheDocument();
  });

  it('renders an "Other" option', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders radio inputs for single-select', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const radios = screen.getAllByRole('radio');
    // 2 options + 1 "Other" = 3
    expect(radios).toHaveLength(3);
  });

  it('renders checkbox inputs for multi-select', () => {
    render(<QuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // 2 options + 1 "Other" = 3
    expect(checkboxes).toHaveLength(3);
  });

  it('allows selecting a single-select option', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]); // Select "Red"
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it('allows selecting multiple options in multi-select', () => {
    render(<QuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Select "Dark mode"
    fireEvent.click(checkboxes[1]); // Select "Animations"
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('allows toggling off a multi-select option', () => {
    render(<QuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Select
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[0]); // Deselect
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('shows text input when "Other" is selected in single-select', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const radios = screen.getAllByRole('radio');
    // Last radio is "Other"
    fireEvent.click(radios[radios.length - 1]);
    expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
  });

  it('shows text input when "Other" is selected in multi-select', () => {
    render(<QuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // Last checkbox is "Other"
    fireEvent.click(checkboxes[checkboxes.length - 1]);
    expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
  });

  it('renders a Submit button', () => {
    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('submits answers and calls onClose', async () => {
    const onClose = vi.fn();
    render(<QuestionModal {...defaultProps} onClose={onClose} questions={[singleSelectQuestion]} />);

    // Select "Red"
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);

    // Submit
    fireEvent.click(screen.getByText('Submit'));

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/sessions/session-123/question',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task_id: 'task-1',
          answers: { color_choice: 'Red' },
        }),
      }),
    );
  });

  it('renders multiple questions', () => {
    render(
      <QuestionModal
        {...defaultProps}
        questions={[singleSelectQuestion, multiSelectQuestion]}
      />,
    );
    expect(screen.getByText('What color do you want?')).toBeInTheDocument();
    expect(screen.getByText('Which features do you want?')).toBeInTheDocument();
  });

  it('disables Submit button while submitting', async () => {
    let resolveSubmit!: () => void;
    mockAuthFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = () => resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );

    render(<QuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    fireEvent.click(screen.getByText('Submit'));

    // Button should be disabled while submitting
    expect(screen.getByText('Submit')).toBeDisabled();

    // Resolve the submission
    resolveSubmit();
    await vi.waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
