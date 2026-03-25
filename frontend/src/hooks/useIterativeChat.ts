/** Hook for post-build iterative chat with the agent. */

import { useCallback } from 'react';
import { useBuildSessionContext } from '../contexts/BuildSessionContext';
import { authFetch } from '../lib/apiClient';

export function useIterativeChat() {
  const {
    sessionId,
    chatMessages,
    isChatProcessing,
    chatTestSummary,
    previewRefreshKey,
    deployUrls,
    handleEvent,
  } = useBuildSessionContext();

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId || !content.trim()) return;
    try {
      const res = await authFetch(`/api/sessions/${sessionId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: content.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        handleEvent({ type: 'chat_error', message: body.detail || 'Failed to send message' });
      }
    } catch {
      handleEvent({ type: 'chat_error', message: 'Failed to send message' });
    }
  }, [sessionId, handleEvent]);

  return {
    messages: chatMessages,
    isAgentThinking: isChatProcessing,
    testSummary: chatTestSummary,
    previewRefreshKey,
    deployUrls,
    sendMessage,
    sessionId,
  };
}
