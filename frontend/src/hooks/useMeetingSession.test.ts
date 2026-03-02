import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeetingSession } from './useMeetingSession';

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
    it('starts with empty invite queue and no active meeting', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));
      expect(result.current.inviteQueue).toEqual([]);
      expect(result.current.nextInvite).toBeNull();
      expect(result.current.activeMeeting).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.canvasState).toEqual({ type: '', data: {} });
    });
  });

  describe('invite queue', () => {
    it('accumulates multiple invites in queue', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Documentation Review',
          description: 'Let me help with docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Architecture Review',
          description: 'Let me show the architecture!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-3',
          meetingTypeId: 'media-agent',
          agentName: 'Media',
          title: 'Media Campaign',
          description: 'Let me create some media!',
        });
      });

      expect(result.current.inviteQueue).toHaveLength(3);
      expect(result.current.inviteQueue[0].meetingId).toBe('meeting-1');
      expect(result.current.inviteQueue[1].meetingId).toBe('meeting-2');
      expect(result.current.inviteQueue[2].meetingId).toBe('meeting-3');
    });

    it('nextInvite returns first item in queue', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Documentation',
          description: 'Docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Architecture',
          description: 'Arch!',
        });
      });

      expect(result.current.nextInvite).toEqual({
        meetingId: 'meeting-1',
        meetingTypeId: 'doc-agent',
        agentName: 'Doc',
        title: 'Documentation',
        description: 'Docs!',
      });
    });

    it('does not add duplicate invites with same meetingId', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Documentation',
          description: 'Docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Documentation',
          description: 'Docs!',
        });
      });

      expect(result.current.inviteQueue).toHaveLength(1);
    });

    it('CLEAR_INVITE removes only the specified meetingId', async () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // Add three invites
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Doc',
          description: 'Docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Arch',
          description: 'Arch!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-3',
          meetingTypeId: 'media-agent',
          agentName: 'Media',
          title: 'Media',
          description: 'Media!',
        });
      });

      expect(result.current.inviteQueue).toHaveLength(3);

      // Decline the middle one
      await act(async () => {
        await result.current.declineInvite('meeting-2');
      });

      expect(result.current.inviteQueue).toHaveLength(2);
      expect(result.current.inviteQueue[0].meetingId).toBe('meeting-1');
      expect(result.current.inviteQueue[1].meetingId).toBe('meeting-3');
    });

    it('MEETING_STARTED clears that invite from queue', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Doc',
          description: 'Docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Arch',
          description: 'Arch!',
        });
      });

      expect(result.current.inviteQueue).toHaveLength(2);

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          canvasType: 'explain-it',
        });
      });

      // meeting-1 should be removed from queue, meeting-2 remains
      expect(result.current.inviteQueue).toHaveLength(1);
      expect(result.current.inviteQueue[0].meetingId).toBe('meeting-2');
      expect(result.current.activeMeeting).not.toBeNull();
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

      expect(result.current.inviteQueue).toHaveLength(1);
      expect(result.current.nextInvite).toEqual({
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
      // Invite should be cleared from queue
      expect(result.current.inviteQueue).toHaveLength(0);
      expect(result.current.nextInvite).toBeNull();
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
    it('removes invite from queue and calls REST API', async () => {
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

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Arch',
          description: 'Review',
        });
      });

      await act(async () => {
        await result.current.acceptInvite('meeting-1');
      });

      // meeting-1 removed, meeting-2 remains
      expect(result.current.inviteQueue).toHaveLength(1);
      expect(result.current.inviteQueue[0].meetingId).toBe('meeting-2');
      expect(authFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/meetings/meeting-1/accept',
        { method: 'POST' },
      );
    });
  });

  describe('declineInvite', () => {
    it('removes invite from queue and calls REST API', async () => {
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

      expect(result.current.inviteQueue).toHaveLength(0);
      expect(result.current.nextInvite).toBeNull();
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

  describe('resetMeetings', () => {
    it('clears all invites and active meeting', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // Add invites
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Doc',
          description: 'Docs!',
        });
      });

      // Start a meeting
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-2',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      expect(result.current.activeMeeting).not.toBeNull();

      // Reset
      act(() => {
        result.current.resetMeetings();
      });

      expect(result.current.inviteQueue).toEqual([]);
      expect(result.current.activeMeeting).toBeNull();
      expect(result.current.nextInvite).toBeNull();
    });
  });

  describe('clearAllInvites', () => {
    it('clears all invites but preserves active meeting', () => {
      const { result } = renderHook(() => useMeetingSession('session-1'));

      // Add invites
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-1',
          meetingTypeId: 'doc-agent',
          agentName: 'Doc',
          title: 'Doc',
          description: 'Docs!',
        });
      });

      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_invite',
          meetingId: 'meeting-2',
          meetingTypeId: 'arch-agent',
          agentName: 'Archie',
          title: 'Arch',
          description: 'Arch!',
        });
      });

      // Start a meeting (different from invites)
      act(() => {
        result.current.handleMeetingEvent({
          type: 'meeting_started',
          meetingId: 'meeting-3',
          meetingTypeId: 'test-type',
          agentName: 'Pixel',
          canvasType: 'debug-canvas',
        });
      });

      expect(result.current.inviteQueue).toHaveLength(2);
      expect(result.current.activeMeeting).not.toBeNull();

      // Clear invites only
      act(() => {
        result.current.clearAllInvites();
      });

      expect(result.current.inviteQueue).toEqual([]);
      expect(result.current.nextInvite).toBeNull();
      // Active meeting should still exist
      expect(result.current.activeMeeting).not.toBeNull();
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
      expect(result.current.inviteQueue).toHaveLength(1);
      expect(result.current.nextInvite).not.toBeNull();

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
      expect(result.current.inviteQueue).toHaveLength(0);
      expect(result.current.nextInvite).toBeNull();

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
