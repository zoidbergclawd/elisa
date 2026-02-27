/** Meeting session state hook -- manages active meeting, invites, and WebSocket events. */

import { useReducer, useCallback } from 'react';
import type { WSEvent } from '../types';
import type { MeetingInvite } from '../components/shared/MeetingInviteToast';
import { authFetch } from '../lib/apiClient';

// -- State --

export interface MeetingMessageEntry {
  role: 'agent' | 'kid';
  content: string;
}

export interface MeetingCanvasState {
  type: string;
  data: Record<string, unknown>;
}

export interface ActiveMeeting {
  meetingId: string;
  meetingTypeId: string;
  agentName: string;
  canvasType: string;
  canvasState: MeetingCanvasState;
  messages: MeetingMessageEntry[];
  outcomes: Array<{ type: string; data: Record<string, unknown> }>;
}

export interface MeetingSessionState {
  pendingInvite: MeetingInvite | null;
  activeMeeting: ActiveMeeting | null;
}

const initialState: MeetingSessionState = {
  pendingInvite: null,
  activeMeeting: null,
};

// -- Actions --

type MeetingAction =
  | { type: 'MEETING_INVITE'; meetingId: string; meetingTypeId: string; agentName: string; title: string; description: string }
  | { type: 'MEETING_STARTED'; meetingId: string; meetingTypeId: string; agentName: string; canvasType: string }
  | { type: 'MEETING_MESSAGE'; meetingId: string; role: 'agent' | 'kid'; content: string }
  | { type: 'MEETING_CANVAS_UPDATE'; meetingId: string; canvasType: string; data: Record<string, unknown> }
  | { type: 'MEETING_OUTCOME'; meetingId: string; outcomeType: string; data: Record<string, unknown> }
  | { type: 'MEETING_ENDED'; meetingId: string; outcomes: Array<{ type: string; data: Record<string, unknown> }> }
  | { type: 'CLEAR_INVITE' }
  | { type: 'RESET' };

// -- Reducer --

function meetingReducer(state: MeetingSessionState, action: MeetingAction): MeetingSessionState {
  switch (action.type) {
    case 'MEETING_INVITE':
      return {
        ...state,
        pendingInvite: {
          meetingId: action.meetingId,
          meetingTypeId: action.meetingTypeId,
          agentName: action.agentName,
          title: action.title,
          description: action.description,
        },
      };

    case 'MEETING_STARTED': {
      return {
        ...state,
        pendingInvite: state.pendingInvite?.meetingId === action.meetingId ? null : state.pendingInvite,
        activeMeeting: {
          meetingId: action.meetingId,
          meetingTypeId: action.meetingTypeId,
          agentName: action.agentName,
          canvasType: action.canvasType,
          canvasState: { type: action.canvasType, data: {} },
          messages: [],
          outcomes: [],
        },
      };
    }

    case 'MEETING_MESSAGE': {
      if (!state.activeMeeting || state.activeMeeting.meetingId !== action.meetingId) return state;
      return {
        ...state,
        activeMeeting: {
          ...state.activeMeeting,
          messages: [...state.activeMeeting.messages, { role: action.role, content: action.content }],
        },
      };
    }

    case 'MEETING_CANVAS_UPDATE': {
      if (!state.activeMeeting || state.activeMeeting.meetingId !== action.meetingId) return state;
      return {
        ...state,
        activeMeeting: {
          ...state.activeMeeting,
          canvasState: { type: action.canvasType, data: action.data },
        },
      };
    }

    case 'MEETING_OUTCOME': {
      if (!state.activeMeeting || state.activeMeeting.meetingId !== action.meetingId) return state;
      return {
        ...state,
        activeMeeting: {
          ...state.activeMeeting,
          outcomes: [...state.activeMeeting.outcomes, { type: action.outcomeType, data: action.data }],
        },
      };
    }

    case 'MEETING_ENDED':
      if (!state.activeMeeting || state.activeMeeting.meetingId !== action.meetingId) return state;
      return {
        ...state,
        activeMeeting: null,
      };

    case 'CLEAR_INVITE':
      return { ...state, pendingInvite: null };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// -- Hook --

export function useMeetingSession(sessionId: string | null) {
  const [state, dispatch] = useReducer(meetingReducer, initialState);

  /** Handle a WSEvent that may be meeting-related. Returns true if handled. */
  const handleMeetingEvent = useCallback((event: WSEvent): boolean => {
    switch (event.type) {
      case 'meeting_invite':
        dispatch({
          type: 'MEETING_INVITE',
          meetingId: event.meetingId,
          meetingTypeId: event.meetingTypeId,
          agentName: event.agentName,
          title: event.title,
          description: event.description,
        });
        return true;

      case 'meeting_started':
        dispatch({
          type: 'MEETING_STARTED',
          meetingId: event.meetingId,
          meetingTypeId: event.meetingTypeId,
          agentName: event.agentName,
          canvasType: event.canvasType,
        });
        return true;

      case 'meeting_message':
        dispatch({
          type: 'MEETING_MESSAGE',
          meetingId: event.meetingId,
          role: event.role,
          content: event.content,
        });
        return true;

      case 'meeting_canvas_update':
        dispatch({
          type: 'MEETING_CANVAS_UPDATE',
          meetingId: event.meetingId,
          canvasType: event.canvasType,
          data: event.data,
        });
        return true;

      case 'meeting_outcome':
        dispatch({
          type: 'MEETING_OUTCOME',
          meetingId: event.meetingId,
          outcomeType: event.outcomeType,
          data: event.data,
        });
        return true;

      case 'meeting_ended':
        dispatch({
          type: 'MEETING_ENDED',
          meetingId: event.meetingId,
          outcomes: event.outcomes,
        });
        return true;

      default:
        return false;
    }
  }, []);

  /** Accept a meeting invite via REST API. */
  const acceptInvite = useCallback(async (meetingId: string) => {
    if (!sessionId) return;
    dispatch({ type: 'CLEAR_INVITE' });
    await authFetch(`/api/sessions/${sessionId}/meetings/${meetingId}/accept`, {
      method: 'POST',
    });
  }, [sessionId]);

  /** Decline a meeting invite via REST API. */
  const declineInvite = useCallback(async (meetingId: string) => {
    if (!sessionId) return;
    dispatch({ type: 'CLEAR_INVITE' });
    await authFetch(`/api/sessions/${sessionId}/meetings/${meetingId}/decline`, {
      method: 'POST',
    });
  }, [sessionId]);

  /** Send a message from the kid via REST API. */
  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId || !state.activeMeeting) return;
    await authFetch(`/api/sessions/${sessionId}/meetings/${state.activeMeeting.meetingId}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }, [sessionId, state.activeMeeting]);

  /** End the active meeting via REST API. */
  const endMeeting = useCallback(async () => {
    if (!sessionId || !state.activeMeeting) return;
    await authFetch(`/api/sessions/${sessionId}/meetings/${state.activeMeeting.meetingId}/end`, {
      method: 'POST',
    });
  }, [sessionId, state.activeMeeting]);

  /** Update the canvas state. */
  const updateCanvas = useCallback(async (data: Record<string, unknown>) => {
    // Canvas updates are handled locally via WS events; no REST call needed for now.
    // Individual canvas implementations may call backend APIs for canvas-specific operations.
    if (state.activeMeeting) {
      dispatch({
        type: 'MEETING_CANVAS_UPDATE',
        meetingId: state.activeMeeting.meetingId,
        canvasType: state.activeMeeting.canvasType,
        data,
      });
    }
  }, [state.activeMeeting]);

  return {
    pendingInvite: state.pendingInvite,
    activeMeeting: state.activeMeeting,
    messages: state.activeMeeting?.messages ?? [],
    canvasState: state.activeMeeting?.canvasState ?? { type: '', data: {} },
    handleMeetingEvent,
    acceptInvite,
    declineInvite,
    sendMessage,
    endMeeting,
    updateCanvas,
  };
}
