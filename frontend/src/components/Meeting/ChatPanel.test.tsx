import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatPanel from './ChatPanel';

const defaultProps = {
  messages: [] as { role: 'agent' | 'kid'; content: string }[],
  agentName: 'Buddy',
  onSendMessage: vi.fn(),
};

describe('ChatPanel', () => {
  it('renders messages', () => {
    const messages = [
      { role: 'agent' as const, content: 'Hello!' },
      { role: 'kid' as const, content: 'Hi!' },
    ];
    render(<ChatPanel {...defaultProps} messages={messages} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi!')).toBeInTheDocument();
  });

  it('shows agent name in agent messages', () => {
    const messages = [{ role: 'agent' as const, content: 'Hello!' }];
    render(<ChatPanel {...defaultProps} messages={messages} />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('sends message on form submit', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendMessage).toHaveBeenCalledWith('Hello');
  });

  it('does not send empty messages', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('clears input after sending', () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(input.closest('form')!);
    expect(input.value).toBe('');
  });

  it('shows thinking indicator when isAgentThinking is true', () => {
    render(<ChatPanel {...defaultProps} isAgentThinking={true} />);
    expect(screen.getByTestId('agent-thinking-indicator')).toBeInTheDocument();
    expect(screen.getByText('thinking...')).toBeInTheDocument();
  });

  it('hides thinking indicator by default', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.queryByTestId('agent-thinking-indicator')).not.toBeInTheDocument();
  });
});
