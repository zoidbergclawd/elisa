import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HumanGateModal from './HumanGateModal';

const defaultProps = {
  taskId: 'task-1',
  question: 'Want to check this out?',
  context: 'Just finished building the UI',
  sessionId: 'session-123',
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
});

describe('HumanGateModal', () => {
  it('renders question and context', () => {
    render(<HumanGateModal {...defaultProps} />);
    expect(screen.getByText('Want to check this out?')).toBeInTheDocument();
    expect(screen.getByText('Just finished building the UI')).toBeInTheDocument();
  });

  it('renders approve and reject buttons', () => {
    render(<HumanGateModal {...defaultProps} />);
    expect(screen.getByText('Looks good!')).toBeInTheDocument();
    expect(screen.getByText("Let's change something")).toBeInTheDocument();
  });

  it('approve sends approved: true and calls onClose', async () => {
    const onClose = vi.fn();
    render(<HumanGateModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Looks good!'));
    // Wait for async
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sessions/session-123/gate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ approved: true }),
      })
    );
  });

  it('clicking reject shows feedback textarea', () => {
    render(<HumanGateModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Let's change something"));
    expect(screen.getByPlaceholderText("Tell me what you'd like to change...")).toBeInTheDocument();
  });

  it('reject with feedback sends approved: false', async () => {
    const onClose = vi.fn();
    render(<HumanGateModal {...defaultProps} onClose={onClose} />);
    // First click shows feedback
    fireEvent.click(screen.getByText("Let's change something"));
    const textarea = screen.getByPlaceholderText("Tell me what you'd like to change...");
    fireEvent.change(textarea, { target: { value: 'Make it blue' } });
    // Second click sends
    fireEvent.click(screen.getByText('Send feedback'));
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sessions/session-123/gate',
      expect.objectContaining({
        body: JSON.stringify({ approved: false, feedback: 'Make it blue' }),
      })
    );
  });
});
