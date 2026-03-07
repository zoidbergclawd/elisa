/** Sidebar listing team members with status and pending invite indicators. */

import AgentAvatar from '../Meeting/AgentAvatar';
import type { MeetingInvite } from '../shared/MeetingInviteToast';

/** Static list of known meeting agent personas. */
const TEAM_MEMBERS = [
  { id: 'buddy-agent', name: 'Buddy', description: 'Mid-build check-in' },
  { id: 'doc-agent', name: 'Scribe', description: 'Documentation' },
  { id: 'architecture-agent', name: 'Blueprint', description: 'Architecture overview' },
  { id: 'debug-convergence', name: 'Bug Detective', description: 'Debug & fix' },
  { id: 'design-task-agent', name: 'Pixel', description: 'Design review' },
  { id: 'media-agent', name: 'Marketing', description: 'Campaign & assets' },
  { id: 'web-design-agent', name: 'Styler', description: 'Launch page design' },
  { id: 'art-agent', name: 'Pixel', description: 'Theme customization' },
  { id: 'integration-agent', name: 'Interface Designer', description: 'Cross-nugget interfaces' },
];

interface TeamMemberListProps {
  inviteQueue: MeetingInvite[];
  activeMeetingTypeId?: string;
  onAcceptInvite: (meetingId: string) => void;
  onDeclineInvite: (meetingId: string) => void;
}

export default function TeamMemberList({
  inviteQueue,
  activeMeetingTypeId,
  onAcceptInvite,
  onDeclineInvite,
}: TeamMemberListProps) {
  const inviteByType = new Map(inviteQueue.map(inv => [inv.meetingTypeId, inv]));

  return (
    <div className="space-y-1 p-3">
      <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Your Team</h3>
      {TEAM_MEMBERS.map(member => {
        const invite = inviteByType.get(member.id);
        const isActive = activeMeetingTypeId === member.id;
        const wantsChat = !!invite;

        return (
          <div
            key={member.id}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-accent-sky/20' : wantsChat ? 'bg-accent-lavender/10' : 'hover:bg-atelier-surface/60'
            }`}
          >
            <AgentAvatar agentName={member.name} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-atelier-text truncate">{member.name}</p>
              <p className="text-xs text-atelier-text-muted truncate">{member.description}</p>
            </div>
            {wantsChat && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onAcceptInvite(invite.meetingId)}
                  className="go-btn px-2 py-1 rounded-lg text-[10px] font-medium"
                  title="Join meeting"
                >
                  Chat
                </button>
                <button
                  onClick={() => onDeclineInvite(invite.meetingId)}
                  className="px-1.5 py-1 rounded-lg text-[10px] text-atelier-text-muted hover:text-atelier-text transition-colors"
                  title="Dismiss"
                >
                  x
                </button>
              </div>
            )}
            {isActive && (
              <span className="w-2 h-2 rounded-full bg-accent-sky animate-pulse shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
