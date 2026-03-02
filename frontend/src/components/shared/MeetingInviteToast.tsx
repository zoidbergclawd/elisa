/** Floating notification toast when a meeting invite arrives. */

import { useEffect, useRef } from 'react';
import AgentAvatar from '../Meeting/AgentAvatar';

export interface MeetingInvite {
  meetingId: string;
  meetingTypeId: string;
  agentName: string;
  title: string;
  description: string;
}

interface MeetingInviteToastProps {
  invite: MeetingInvite | null;
  onAccept: (meetingId: string) => void;
  onDecline: (meetingId: string) => void;
  /** When true, pause the auto-dismiss timer (e.g., while a meeting modal is open). */
  pauseAutoDismiss?: boolean;
}

const AUTO_DISMISS_MS = 30_000;

export default function MeetingInviteToast({ invite, onAccept, onDecline, pauseAutoDismiss }: MeetingInviteToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!invite || pauseAutoDismiss) {
      // Clear any existing timer when paused or no invite
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }

    // Auto-dismiss after 30 seconds (treated as "Maybe Later")
    timerRef.current = setTimeout(() => {
      onDecline(invite.meetingId);
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [invite, onDecline, pauseAutoDismiss]);

  if (!invite) return null;

  // z-index hierarchy: error modals z-[100] > regular modals z-50 > toasts z-40
  return (
    <div
      className="fixed right-4 top-20 w-80 glass-elevated rounded-xl shadow-lg p-4 z-40 animate-float-in border-l-2 border-l-accent-sky"
      role="alert"
      aria-label="Meeting invite"
    >
      <div className="flex items-start gap-3">
        {/* Agent avatar */}
        <AgentAvatar agentName={invite.agentName} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-atelier-text">{invite.agentName}</p>
          <p className="text-sm font-medium text-atelier-text mt-0.5">{invite.title}</p>
          <p className="text-xs text-atelier-text-secondary mt-1">{invite.description}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-3 justify-end">
        <button
          onClick={() => onDecline(invite.meetingId)}
          className="px-3 py-1.5 rounded-xl text-xs cursor-pointer border border-atelier-text-muted/30 text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
        >
          Maybe Later
        </button>
        <button
          onClick={() => onAccept(invite.meetingId)}
          className="go-btn px-3 py-1.5 rounded-xl font-medium text-xs"
        >
          Join Meeting
        </button>
      </div>
    </div>
  );
}
