/** Inline meeting conversation using the shared ChatPanel + CanvasPanel. */

import ChatPanel from '../Meeting/ChatPanel';
import CanvasPanel from '../Meeting/CanvasPanel';
import MeetingLayout from '../Meeting/MeetingLayout';
import AgentAvatar from '../Meeting/AgentAvatar';

// Import canvas side-effects (same as MeetingModal)
import '../Meeting/BlueprintCanvas';
import '../Meeting/BugDetectiveCanvas';
import '../Meeting/CampaignCanvas';
import '../Meeting/DesignPreviewCanvas';
import '../Meeting/ExplainItCanvas';
import '../Meeting/InterfaceDesignerCanvas';
import '../Meeting/LaunchPadCanvas';
import '../Meeting/TestDashboardCanvas';
import '../Meeting/ThemePickerCanvas';

import type { MeetingMessageEntry, MeetingCanvasState } from '../../hooks/useMeetingSession';

interface TeamConversationProps {
  meetingId: string;
  agentName: string;
  canvasType: string;
  canvasState: MeetingCanvasState;
  messages: MeetingMessageEntry[];
  isAgentThinking: boolean;
  onSendMessage: (content: string) => void;
  onCanvasUpdate: (data: Record<string, unknown>) => void;
  onEndMeeting: () => void;
  onMaterialize?: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
}

export default function TeamConversation({
  meetingId,
  agentName,
  canvasType,
  canvasState,
  messages,
  isAgentThinking,
  onSendMessage,
  onCanvasUpdate,
  onEndMeeting,
  onMaterialize,
}: TeamConversationProps) {
  return (
    <MeetingLayout
      header={
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <AgentAvatar agentName={agentName} size={28} />
            <h3 className="text-sm font-semibold text-atelier-text">
              Chatting with {agentName}
            </h3>
          </div>
          <button
            onClick={onEndMeeting}
            className="px-3 py-1 rounded-lg text-xs cursor-pointer border border-red-500/30 text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
          >
            End
          </button>
        </div>
      }
      chatPanel={
        <ChatPanel
          messages={messages}
          isAgentThinking={isAgentThinking}
          agentName={agentName}
          onSendMessage={onSendMessage}
        />
      }
      canvasPanel={
        <CanvasPanel
          meetingId={meetingId}
          canvasType={canvasType}
          canvasState={canvasState}
          onCanvasUpdate={onCanvasUpdate}
          onMaterialize={onMaterialize}
        />
      }
    />
  );
}
