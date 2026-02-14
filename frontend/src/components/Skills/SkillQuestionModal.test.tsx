import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SkillQuestionModal from './SkillQuestionModal';
import type { QuestionPayload } from '../../types';
import { setAuthToken } from '../../lib/apiClient';

// Mock global fetch
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

const singleSelectQuestion: QuestionPayload = {
  header: 'Color Theme',
  question: 'What color theme do you want?',
  multiSelect: false,
  options: [
    { label: 'Dark', description: 'Dark background with light text' },
    { label: 'Light', description: 'Light background with dark text' },
  ],
};

const multiSelectQuestion: QuestionPayload = {
  header: 'Features',
  question: 'Which features do you want?',
  multiSelect: true,
  options: [
    { label: 'Animations', description: 'Smooth transitions' },
    { label: 'Sound', description: 'Audio feedback' },
    { label: 'Haptics' },
  ],
};

const defaultProps = {
  stepId: 'step-1',
  sessionId: 'session-abc',
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
});

describe('SkillQuestionModal', () => {
  it('renders the modal title', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    expect(screen.getByText('Skill needs your input')).toBeInTheDocument();
  });

  it('renders radio buttons for single-select question', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
  });

  it('renders checkboxes for multi-select question', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(screen.getByText('Animations')).toBeInTheDocument();
    expect(screen.getByText('Sound')).toBeInTheDocument();
    expect(screen.getByText('Haptics')).toBeInTheDocument();
  });

  it('selects a radio option on click', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it('toggles checkbox options on click', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();
    // Uncheck first
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('submits single-select answer and calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <SkillQuestionModal
        {...defaultProps}
        questions={[singleSelectQuestion]}
        onClose={onClose}
      />,
    );
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // Select "Light"
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/skills/session-abc/answer', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          step_id: 'step-1',
          answers: { 'Color Theme': 'Light' },
        }),
      }));
      // Verify Content-Type header is present (set by authFetch)
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['Content-Type']).toBe('application/json');
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits multi-select answers', async () => {
    const onClose = vi.fn();
    render(
      <SkillQuestionModal
        {...defaultProps}
        questions={[multiSelectQuestion]}
        onClose={onClose}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Animations
    fireEvent.click(checkboxes[2]); // Haptics
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/skills/session-abc/answer', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          step_id: 'step-1',
          answers: { Features: ['Animations', 'Haptics'] },
        }),
      }));
    });
  });

  it('renders multiple questions', () => {
    render(
      <SkillQuestionModal
        {...defaultProps}
        questions={[singleSelectQuestion, multiSelectQuestion]}
      />,
    );
    expect(screen.getByText('What color theme do you want?')).toBeInTheDocument();
    expect(screen.getByText('Which features do you want?')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('disables submit button while submitting', async () => {
    // Make fetch take time
    let resolveFetch: () => void;
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = () => r({ ok: true }); }));

    render(<SkillQuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
    const submitBtn = screen.getByText('Submit');
    fireEvent.click(submitBtn);

    await waitFor(() => expect(submitBtn).toBeDisabled());
    resolveFetch!();
  });

  it('renders option without description', () => {
    render(<SkillQuestionModal {...defaultProps} questions={[multiSelectQuestion]} />);
    // "Haptics" has no description
    expect(screen.getByText('Haptics')).toBeInTheDocument();
    // Verify the other options have their descriptions
    expect(screen.getByText('Smooth transitions')).toBeInTheDocument();
    expect(screen.getByText('Audio feedback')).toBeInTheDocument();
  });

  it('includes Authorization header when auth token is set', async () => {
    setAuthToken('test-token-123');
    try {
      render(<SkillQuestionModal {...defaultProps} questions={[singleSelectQuestion]} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[0]); // Select "Dark"
      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const callHeaders = mockFetch.mock.calls[0][1].headers;
        expect(callHeaders['Authorization']).toBe('Bearer test-token-123');
        expect(callHeaders['Content-Type']).toBe('application/json');
      });
    } finally {
      setAuthToken(null);
    }
  });
});
