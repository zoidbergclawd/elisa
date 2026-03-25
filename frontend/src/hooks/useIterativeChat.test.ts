import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIterativeChat } from './useIterativeChat';

const mockHandleEvent = vi.fn();
const mockAuthFetch = vi.fn();

vi.mock('../contexts/BuildSessionContext', () => ({
  useBuildSessionContext: vi.fn(() => ({
    sessionId: 'sess-1',
    chatMessages: [{ role: 'kid', content: 'Hello' }],
    isChatProcessing: false,
    chatTestSummary: { passed: 2, failed: 0, total: 2 },
    previewRefreshKey: 1,
    deployUrls: { web: 'http://localhost:3001' },
    handleEvent: mockHandleEvent,
  })),
}));

vi.mock('../lib/apiClient', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

describe('useIterativeChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes chat state from context', () => {
    const { result } = renderHook(() => useIterativeChat());
    expect(result.current.messages).toEqual([{ role: 'kid', content: 'Hello' }]);
    expect(result.current.isAgentThinking).toBe(false);
    expect(result.current.testSummary).toEqual({ passed: 2, failed: 0, total: 2 });
    expect(result.current.previewRefreshKey).toBe(1);
    expect(result.current.deployUrls).toEqual({ web: 'http://localhost:3001' });
    expect(result.current.sessionId).toBe('sess-1');
  });

  it('sends message via POST', async () => {
    mockAuthFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useIterativeChat());
    await act(async () => {
      await result.current.sendMessage('Make it blue');
    });

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/sessions/sess-1/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Make it blue' }),
    });
  });

  it('does not send empty messages', async () => {
    const { result } = renderHook(() => useIterativeChat());
    await act(async () => {
      await result.current.sendMessage('   ');
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('dispatches chat_error on failed response', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ detail: 'Agent failed' }),
    });

    const { result } = renderHook(() => useIterativeChat());
    await act(async () => {
      await result.current.sendMessage('Fix this');
    });

    expect(mockHandleEvent).toHaveBeenCalledWith({
      type: 'chat_error',
      message: 'Agent failed',
    });
  });

  it('dispatches chat_error on network failure', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useIterativeChat());
    await act(async () => {
      await result.current.sendMessage('Fix this');
    });

    expect(mockHandleEvent).toHaveBeenCalledWith({
      type: 'chat_error',
      message: 'Failed to send message',
    });
  });

  it('does not send when sessionId is null', async () => {
    const { useBuildSessionContext } = await import('../contexts/BuildSessionContext');
    (useBuildSessionContext as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionId: null,
      chatMessages: [],
      isChatProcessing: false,
      chatTestSummary: null,
      previewRefreshKey: 0,
      deployUrls: {},
      handleEvent: mockHandleEvent,
    });

    const { result } = renderHook(() => useIterativeChat());
    await act(async () => {
      await result.current.sendMessage('Hello');
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});
