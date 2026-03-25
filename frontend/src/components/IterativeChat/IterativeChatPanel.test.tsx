import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import IterativeChatPanel from './IterativeChatPanel';
import { defaultBuildSessionValue } from '../../test-utils/renderWithProviders';

const mockSendMessage = vi.fn();

vi.mock('../../hooks/useIterativeChat', () => ({
  useIterativeChat: vi.fn(() => ({
    messages: [],
    isAgentThinking: false,
    testSummary: null,
    previewRefreshKey: 0,
    sendMessage: mockSendMessage,
  })),
}));

vi.mock('../../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => ({
    ...defaultBuildSessionValue,
    sessionId: 'sess-1',
    events: [{ type: 'session_complete', summary: 'Build done!' }],
  })),
}));

vi.mock('../../contexts/MeetingContext', () => ({
  useMeetingContext: vi.fn(() => ({
    inviteQueue: [],
    acceptInvite: vi.fn(),
    startDirectMeeting: vi.fn(),
  })),
}));

const defaultProps = {
  onBuildNew: vi.fn(),
  onKeepWorking: vi.fn(),
};

describe('IterativeChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the panel with heading', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('Chat with Roo')).toBeInTheDocument();
  });

  it('shows session complete summary', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('Build done!')).toBeInTheDocument();
  });

  it('shows empty state message when no chat messages', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText(/Tell me what you'd like to change/)).toBeInTheDocument();
  });

  it('renders chat messages when present', async () => {
    const { useIterativeChat } = await import('../../hooks/useIterativeChat');
    (useIterativeChat as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [
        { role: 'kid', content: 'Make the button red' },
        { role: 'agent', content: 'Done! I changed the button color.', filesChanged: ['style.css'] },
      ],
      isAgentThinking: false,
      testSummary: null,
      previewRefreshKey: 0,
      sendMessage: mockSendMessage,
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('Make the button red')).toBeInTheDocument();
    expect(screen.getByText('Done! I changed the button color.')).toBeInTheDocument();
    expect(screen.getByText(/style\.css/)).toBeInTheDocument();
  });

  it('shows thinking indicator when agent is processing', async () => {
    const { useIterativeChat } = await import('../../hooks/useIterativeChat');
    (useIterativeChat as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [{ role: 'kid', content: 'Fix the bug' }],
      isAgentThinking: true,
      testSummary: null,
      previewRefreshKey: 0,
      sendMessage: mockSendMessage,
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByTestId('chat-thinking-indicator')).toBeInTheDocument();
  });

  it('sends message on form submit', async () => {
    // Explicitly set mock to ensure sendMessage is our module-level spy
    const { useIterativeChat } = await import('../../hooks/useIterativeChat');
    (useIterativeChat as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      isAgentThinking: false,
      testSummary: null,
      previewRefreshKey: 0,
      sendMessage: mockSendMessage,
    });

    render(<IterativeChatPanel {...defaultProps} />);
    const textarea = screen.getByLabelText('Chat message input');
    fireEvent.change(textarea, { target: { value: 'Change the title' } });
    fireEvent.submit(textarea.closest('form')!);
    expect(mockSendMessage).toHaveBeenCalledWith('Change the title');
  });

  it('disables input when agent is thinking', async () => {
    const { useIterativeChat } = await import('../../hooks/useIterativeChat');
    (useIterativeChat as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      isAgentThinking: true,
      testSummary: null,
      previewRefreshKey: 0,
      sendMessage: mockSendMessage,
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByLabelText('Chat message input')).toBeDisabled();
  });

  it('shows "No preview available" when no deploy URL', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('No preview available')).toBeInTheDocument();
  });

  it('shows test summary when available from chat', async () => {
    const { useIterativeChat } = await import('../../hooks/useIterativeChat');
    (useIterativeChat as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      isAgentThinking: false,
      testSummary: { passed: 3, failed: 1, total: 4 },
      previewRefreshKey: 0,
      sendMessage: mockSendMessage,
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByTestId('chat-test-summary')).toBeInTheDocument();
    expect(screen.getByText('Tests: 3/4 passing')).toBeInTheDocument();
  });

  it('calls onBuildNew when Build Something New is clicked', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Build Something New'));
    expect(defaultProps.onBuildNew).toHaveBeenCalled();
  });

  it('calls onKeepWorking when Back to Design is clicked', () => {
    render(<IterativeChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Back to Design'));
    expect(defaultProps.onKeepWorking).toHaveBeenCalled();
  });

  it('shows Fix It button when there are test failures', async () => {
    const { useBuildSessionContext } = await import('../../contexts/BuildSessionContext');
    (useBuildSessionContext as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultBuildSessionValue,
      testResults: [{ test_name: 'test1', passed: false, details: 'fail', status: 'failed' }],
      events: [{ type: 'session_complete', summary: 'Done' }],
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('Fix It')).toBeInTheDocument();
  });

  it('shows test pass count in header when tests exist', async () => {
    const { useBuildSessionContext } = await import('../../contexts/BuildSessionContext');
    (useBuildSessionContext as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultBuildSessionValue,
      testResults: [
        { test_name: 'test1', passed: true, details: 'ok' },
        { test_name: 'test2', passed: false, details: 'fail' },
      ],
      events: [{ type: 'session_complete', summary: 'Done' }],
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('1/2 tests passing')).toBeInTheDocument();
  });

  it('shows Fix in progress indicator when isFixing is true', async () => {
    const { useBuildSessionContext } = await import('../../contexts/BuildSessionContext');
    (useBuildSessionContext as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultBuildSessionValue,
      isFixing: true,
      events: [{ type: 'session_complete', summary: 'Done' }],
    });

    render(<IterativeChatPanel {...defaultProps} />);
    expect(screen.getByText('Fix in progress...')).toBeInTheDocument();
  });
});
