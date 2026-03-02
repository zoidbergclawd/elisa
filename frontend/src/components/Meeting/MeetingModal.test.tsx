import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MeetingModal from './MeetingModal';

const defaultProps = {
  meetingId: 'meeting-1',
  agentName: 'Pixel',
  canvasType: 'test-canvas',
  canvasState: { type: 'test-canvas', data: {} },
  messages: [],
  onSendMessage: vi.fn(),
  onCanvasUpdate: vi.fn(),
  onEndMeeting: vi.fn(),
};

describe('MeetingModal', () => {
  it('renders with agent name in header', () => {
    render(<MeetingModal {...defaultProps} />);
    expect(screen.getByText('Meeting with Pixel')).toBeInTheDocument();
  });

  it('renders the agent avatar', () => {
    render(<MeetingModal {...defaultProps} />);
    expect(screen.getByRole('img', { name: 'Pixel avatar' })).toBeInTheDocument();
  });

  it('renders messages', () => {
    const messages = [
      { role: 'agent' as const, content: 'Hello kid!' },
      { role: 'kid' as const, content: 'Hi there!' },
    ];
    render(<MeetingModal {...defaultProps} messages={messages} />);
    expect(screen.getByText('Hello kid!')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('shows agent name in agent messages', () => {
    const messages = [{ role: 'agent' as const, content: 'Hello!' }];
    render(<MeetingModal {...defaultProps} messages={messages} />);
    // Agent name appears in message bubble
    expect(screen.getAllByText('Pixel').length).toBeGreaterThanOrEqual(1);
  });

  it('sends a message on form submit', () => {
    const onSendMessage = vi.fn();
    render(<MeetingModal {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'My message' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendMessage).toHaveBeenCalledWith('My message');
  });

  it('does not send empty messages', () => {
    const onSendMessage = vi.fn();
    render(<MeetingModal {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('clears input after sending', () => {
    render(<MeetingModal {...defaultProps} />);

    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.submit(input.closest('form')!);

    expect(input.value).toBe('');
  });

  it('calls onEndMeeting when End Meeting is clicked', () => {
    const onEndMeeting = vi.fn();
    render(<MeetingModal {...defaultProps} onEndMeeting={onEndMeeting} />);

    fireEvent.click(screen.getByText('End Meeting'));
    expect(onEndMeeting).toHaveBeenCalled();
  });

  it('renders the default canvas when no canvas registered', () => {
    render(<MeetingModal {...defaultProps} />);
    expect(screen.getByText('Canvas coming soon')).toBeInTheDocument();
  });

  it('has correct ARIA attributes for dialog', () => {
    render(<MeetingModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('disables send button when input is empty', () => {
    render(<MeetingModal {...defaultProps} />);
    const sendButton = screen.getByText('Send');
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has content', () => {
    render(<MeetingModal {...defaultProps} />);
    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByText('Send')).not.toBeDisabled();
  });

  describe('typing indicator (P2 #19 regression)', () => {
    it('shows thinking indicator when isAgentThinking is true', () => {
      render(<MeetingModal {...defaultProps} isAgentThinking={true} />);
      expect(screen.getByTestId('agent-thinking-indicator')).toBeInTheDocument();
      expect(screen.getByText('thinking...')).toBeInTheDocument();
    });

    it('hides thinking indicator when isAgentThinking is false', () => {
      render(<MeetingModal {...defaultProps} isAgentThinking={false} />);
      expect(screen.queryByTestId('agent-thinking-indicator')).not.toBeInTheDocument();
    });

    it('hides thinking indicator by default', () => {
      render(<MeetingModal {...defaultProps} />);
      expect(screen.queryByTestId('agent-thinking-indicator')).not.toBeInTheDocument();
    });

    it('shows agent name in thinking indicator', () => {
      render(<MeetingModal {...defaultProps} isAgentThinking={true} />);
      const indicator = screen.getByTestId('agent-thinking-indicator');
      expect(indicator).toHaveTextContent('Pixel');
    });
  });
});
