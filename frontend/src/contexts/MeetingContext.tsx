import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useMeetingSession } from '../hooks/useMeetingSession';
import type { MeetingMessageEntry, MeetingCanvasState, ActiveMeeting } from '../hooks/useMeetingSession';
import type { MeetingInvite } from '../components/shared/MeetingInviteToast';
import type { WSEvent } from '../types';

export interface MeetingContextValue {
  // State
  inviteQueue: MeetingInvite[];
  nextInvite: MeetingInvite | null;
  activeMeeting: ActiveMeeting | null;
  isAgentThinking: boolean;
  messages: MeetingMessageEntry[];
  canvasState: MeetingCanvasState;

  // Actions
  handleMeetingEvent: (event: WSEvent) => boolean;
  acceptInvite: (meetingId: string) => Promise<void>;
  declineInvite: (meetingId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  endMeeting: () => Promise<void>;
  updateCanvas: (data: Record<string, unknown>) => Promise<void>;
  materializeArtifacts: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
  resetMeetings: () => void;
}

const MeetingContext = createContext<MeetingContextValue | null>(null);

export interface MeetingProviderProps {
  children: ReactNode;
  sessionId: string | null;
}

export function MeetingProvider({ children, sessionId }: MeetingProviderProps) {
  const meeting = useMeetingSession(sessionId);

  const value: MeetingContextValue = {
    inviteQueue: meeting.inviteQueue,
    nextInvite: meeting.nextInvite,
    activeMeeting: meeting.activeMeeting,
    isAgentThinking: meeting.isAgentThinking,
    messages: meeting.messages,
    canvasState: meeting.canvasState,
    handleMeetingEvent: meeting.handleMeetingEvent,
    acceptInvite: meeting.acceptInvite,
    declineInvite: meeting.declineInvite,
    sendMessage: meeting.sendMessage,
    endMeeting: meeting.endMeeting,
    updateCanvas: meeting.updateCanvas,
    materializeArtifacts: meeting.materializeArtifacts,
    resetMeetings: meeting.resetMeetings,
  };

  return (
    <MeetingContext.Provider value={value}>
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeetingContext(): MeetingContextValue {
  const ctx = useContext(MeetingContext);
  if (!ctx) {
    throw new Error('useMeetingContext must be used within a MeetingProvider');
  }
  return ctx;
}
