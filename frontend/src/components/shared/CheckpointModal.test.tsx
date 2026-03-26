import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckpointModal from './CheckpointModal';

// Mock authFetch
vi.mock('../../lib/apiClient', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true })),
}));

const defaultProps = {
  checkpointId: 'cp-1',
  checkpointType: 'progress' as const,
  taskId: 'task-1',
  sessionId: 'sess-1',
  progressPct: 50,
  summary: 'Completed "Build UI" (5/10 tasks done)',
  onClose: vi.fn(),
};

describe('CheckpointModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders progress checkpoint with title and summary', () => {
    render(<CheckpointModal {...defaultProps} />);
    expect(screen.getByText('Progress check-in')).toBeTruthy();
    expect(screen.getByText(/Build UI/)).toBeTruthy();
    expect(screen.getByText('50% done')).toBeTruthy();
  });

  it('renders visual checkpoint title', () => {
    render(<CheckpointModal {...defaultProps} checkpointType="visual" />);
    expect(screen.getByText('How does this look?')).toBeTruthy();
  });

  it('renders choice checkpoint with choices', () => {
    const choices = [
      { id: 'a', label: 'Option A', description: 'First' },
      { id: 'b', label: 'Option B', description: 'Second' },
    ];
    render(<CheckpointModal {...defaultProps} checkpointType="choice" choices={choices} />);
    expect(screen.getByText('Your decision!')).toBeTruthy();
    expect(screen.getByText('Option A')).toBeTruthy();
    expect(screen.getByText('Option B')).toBeTruthy();
  });

  it('shows approve/reject buttons for non-choice checkpoints', () => {
    render(<CheckpointModal {...defaultProps} />);
    expect(screen.getByText('Looks great!')).toBeTruthy();
    expect(screen.getByText("Let's change something")).toBeTruthy();
  });

  it('shows pick button for choice checkpoints', () => {
    const choices = [{ id: 'a', label: 'Option A', description: 'First' }];
    render(<CheckpointModal {...defaultProps} checkpointType="choice" choices={choices} />);
    expect(screen.getByText('Pick this one!')).toBeTruthy();
  });

  it('calls authFetch and onClose when approving', async () => {
    const { authFetch } = await import('../../lib/apiClient');
    render(<CheckpointModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Looks great!'));
    await waitFor(() => {
      expect(authFetch).toHaveBeenCalledWith('/api/sessions/sess-1/checkpoint', expect.objectContaining({
        method: 'POST',
      }));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('renders narrator message when provided', () => {
    render(<CheckpointModal {...defaultProps} narratorMessage="Looking good so far!" />);
    expect(screen.getByText('Looking good so far!')).toBeTruthy();
  });

  it('renders screenshot for visual checkpoint', () => {
    render(
      <CheckpointModal
        {...defaultProps}
        checkpointType="visual"
        screenshotBase64="abc123"
      />,
    );
    const img = screen.getByAltText('Current build preview');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('has proper accessibility attributes', () => {
    render(<CheckpointModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('checkpoint-modal-title');
  });

  it('pick button is disabled until a choice is selected', () => {
    const choices = [{ id: 'a', label: 'Option A', description: 'First' }];
    render(<CheckpointModal {...defaultProps} checkpointType="choice" choices={choices} />);
    const pickBtn = screen.getByText('Pick this one!');
    expect(pickBtn.hasAttribute('disabled')).toBe(true);

    // Select a choice
    fireEvent.click(screen.getByText('Option A'));
    expect(pickBtn.hasAttribute('disabled')).toBe(false);
  });
});
