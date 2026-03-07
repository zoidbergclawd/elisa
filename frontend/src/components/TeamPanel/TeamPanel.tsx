/** Persistent Team tab: member list sidebar + inline meeting conversation. */

import TeamMemberList from './TeamMemberList';
import TeamConversation from './TeamConversation';
import { useMeetingContext } from '../../contexts/MeetingContext';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';

export default function TeamPanel() {
  const {
    inviteQueue, activeMeeting, isAgentThinking,
    messages, canvasState,
    acceptInvite, declineInvite, startDirectMeeting,
    sendMessage, endMeeting, updateCanvas, materializeArtifacts,
  } = useMeetingContext();

  const { sessionId } = useBuildSessionContext();

  return (
    <div className="flex w-full h-full">
      {/* Left sidebar: team member list */}
      <div className="w-56 shrink-0 border-r border-border-subtle overflow-y-auto">
        <TeamMemberList
          inviteQueue={inviteQueue}
          activeMeetingTypeId={activeMeeting?.meetingTypeId}
          onAcceptInvite={acceptInvite}
          onDeclineInvite={declineInvite}
          onStartChat={startDirectMeeting}
          hasSession={!!sessionId}
        />
      </div>

      {/* Right area: active conversation or empty state */}
      <div className="flex-1 min-w-0">
        {activeMeeting ? (
          <TeamConversation
            meetingId={activeMeeting.meetingId}
            agentName={activeMeeting.agentName}
            canvasType={activeMeeting.canvasType}
            canvasState={canvasState}
            messages={messages}
            isAgentThinking={isAgentThinking}
            onSendMessage={sendMessage}
            onCanvasUpdate={updateCanvas}
            onEndMeeting={endMeeting}
            onMaterialize={materializeArtifacts}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-atelier-text-muted">
            <div className="text-center">
              <p className="text-lg font-display font-bold mb-2">Your Team</p>
              <p className="text-sm">
                {inviteQueue.length > 0
                  ? `${inviteQueue.length} team member${inviteQueue.length > 1 ? 's' : ''} want to chat! Click "Chat" to start.`
                  : sessionId
                  ? 'Click any team member to start a conversation.'
                  : 'Your team agents will appear here during builds.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
