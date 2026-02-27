import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeetingSession } from './useMeetingSession';
import type { WSEvent } from '../types';

// Mock authFetch
vi.mock('../lib/apiClient', () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
  getAuthToken: vi.fn().mockReturnValue('test-token'),
  authHeaders: vi.fn().mockReturnValue({}),
}));

describe('useMeetingSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with no pending invite and no active meeting', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));
      expect(result.current.pendingInvite).toBeNull();
      expect(result.current.activeMeeting).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.canvasState).toEqual({ type: '', data: {} });
    });
  });

  describe('handleMeetingEvent', () => {
    it('handles meeting_invite event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        const handled = result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          title: 'Debug Session',
          description: 'Let me help you fix this!',
        });
        expect(handled).toBe(true);
      });

      expect(result.current.pendingInvite).toEqual({
        meetingId: 'meeting-1',
        meetingTypeId: 'test-type',
        agentName: 'Pixel',
        title: 'Debug Session',
        description: 'Let me help you fix this!',
      });
    });

    it('handles meeting_started event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // First send invite
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          title: 'Debug',
          description: 'Help',
        });
      });

      // Then started
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      expect(result.current.activeMeeting).not.toBeNull();
      expect(result.current.activeMeeting!.meetingId).toBe('meeting-1');
      expect(result.current.activeMeeting!.canvasType).toBe('debug-canvas');
      // Invite should be cleared
      expect(result.current.pendingInvite).toBeNull();
    });

    it('handles meeting_message event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // Start meeting
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      // Send message
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'meeting-1',
          role: 'agent',
          content: 'Hello!',
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toEqual({ role: 'agent', content: 'Hello!' });
    });

    it('accumulates multiple messages', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'meeting-1',
          role: 'agent',
          content: 'Hello!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'meeting-1',
          role: 'kid',
          content: 'Hi there!',
        });
      });

      expect(result.current.messages).toHaveLength(2);
    });

    it('handles meeting_canvas_update event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_canvas_update',
          meetingId: 'meeting-1',
          canvasType: 'debug-canvas',
          data: { selectedFile: 'app.py' },
        });
      });

      expect(result.current.canvasState).toEqual({
        type: 'debug-canvas',
        data: { selectedFile: 'app.py' },
      });
    });

    it('handles meeting_outcome event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_outcome',
          meetingId: 'meeting-1',
          outcomeType: 'fix_task',
          data: { file: 'app.py' },
        });
      });

      expect(result.current.activeMeeting!.outcomes).toHaveLength(1);
      expect(result.current.activeMeeting!.outcomes[0]).toEqual({
        type: 'fix_task',
        data: { file: 'app.py' },
      });
    });

    it('handles meeting_ended event', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_ended',
          meetingId: 'meeting-1',
          outcomes: [{ type: 'fix', data: {} }],
        });
      });

      expect(result.current.activeMeeting).toBeNull();
      expect(result.current.messages).toEqual([]);
    });

    it('returns false for non-meeting events', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      let handled: boolean;
      act(() => {
        handled = result.current.handleMeetingEvent({
          type: 'task_started',
          task_id: 't1',
          agent_name: 'Sparky',
        });
        expect(handled).toBe(false);
      });
    });

    it('ignores messages for different meeting IDs', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'different-meeting',
          role: 'agent',
          content: 'Wrong meeting',
        });
      });

      expect(result.current.messages).toHaveLength(0);
    });
  });

  describe('acceptInvite', () => {
    it('clears pending invite and calls REST API', async () => {
      const { authFetch } = await import('../lib/apiClient');
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          title: 'Debug',
          description: 'Help',
        });
      });

      await act(async () => {
        await result.current.acceptInvite('meeting-1');
      });

      expect(result.current.pendingInvite).toBeNull();
      expect(authFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/meetings/meeting-1/accept',
        { method: 'POST' },
      );
    });
  });

  describe('declineInvite', () => {
    it('clears pending invite and calls REST API', async () => {
      const { authFetch } = await import('../lib/apiClient');
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          title: 'Debug',
          description: 'Help',
        });
      });

      await act(async () => {
        await result.current.declineInvite('meeting-1');
      });

      expect(result.current.pendingInvite).toBeNull();
      expect(authFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/meetings/meeting-1/decline',
        { method: 'POST' },
      );
    });
  });

  describe('sendMessage', () => {
    it('calls REST API with message content', async () => {
      const { authFetch } = await import('../lib/apiClient');
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      expect(authFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/meetings/meeting-1/message',
        { method: 'POST', body: JSON.stringify({ content: 'Hello!' }) },
      );
    });

    it('does nothing when no active meeting', async () => {
      const { authFetch } = await import('../lib/apiClient');
      const { result } = renderHook(() => useMeetingSession('session-1'));

      await act(async () => {
        await result.current.sendMessage('Hello!');
      });

      expect(authFetch).not.toHaveBeenCalled();
    });
  });

  describe('endMeeting', () => {
    it('calls REST API to end meeting', async () => {
      const { authFetch } = await import('../lib/apiClient');
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      await act(async () => {
        await result.current.endMeeting();
      });

      expect(authFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/meetings/meeting-1/end',
        { method: 'POST' },
      );
    });
  });

  describe('full lifecycle via WS events', () => {
    it('invite -> accept -> messages -> outcome -> end', async () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // Invite
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          title: 'Debug Session',
          description: 'Let me help',
        });
      });
      expect(result.current.pendingInvite).not.toBeNull();

      // Started (after accept call on backend)
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });
      expect(result.current.activeMeeting).not.toBeNull();
      expect(result.current.pendingInvite).toBeNull();

      // Messages
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'meeting-1',
          role: 'agent',
          content: 'The test is failing on line 5.',
        });
      });
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_message',
          meetingId: 'meeting-1',
          role: 'kid',
          content: 'Can you fix it?',
        });
      });
      expect(result.current.messages).toHaveLength(2);

      // Canvas update
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_canvas_update',
          meetingId: 'meeting-1',
          canvasType: 'debug-canvas',
          data: { highlightedLine: 5 },
        });
      });
      expect(result.current.canvasState.data).toEqual({ highlightedLine: 5 });

      // Outcome
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_outcome',
          meetingId: 'meeting-1',
          outcomeType: 'fix_task',
          data: { file: 'app.py', line: 5 },
        });
      });
      expect(result.current.activeMeeting!.outcomes).toHaveLength(1);

      // Meeting ended
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_ended',
          meetingId: 'meeting-1',
          outcomes: [{ type: 'fix_task', data: { file: 'app.py', line: 5 } }],
        });
      });
      expect(result.current.activeMeeting).toBeNull();
    });
  });
});
