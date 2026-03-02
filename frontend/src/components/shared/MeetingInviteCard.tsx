/** Inline meeting invite card for embedding in the done modal. */

import AgentAvatar from '../Meeting/AgentAvatar';
import type { MeetingInvite } from './MeetingInviteToast';

interface MeetingInviteCardProps {
  invite: MeetingInvite;
  onAccept: (meetingId: string) => void;
  onDecline: (meetingId: string) => void;
}

export default function MeetingInviteCard({ invite, onAccept, onDecline }: MeetingInviteCardProps) {
  return (
    <div
      className="glass-panel rounded-xl border-l-2 border-l-accent-sky p-4 w-64 shrink-0"
      role="region"
      aria-label={`Meeting invite from ${invite.agentName}`}
    >
      <div className="flex items-start gap-3">
        {/* Agent avatar */}
        <AgentAvatar agentName={invite.agentName} size={32} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-atelier-text">{invite.agentName}</p>
          <p className="text-sm font-medium text-atelier-text mt-0.5">{invite.title}</p>
          <p className="text-xs text-atelier-text-secondary mt-1 line-clamp-2">{invite.description}</p>
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
