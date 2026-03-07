/** Inline meeting conversation using the shared ChatPanel + CanvasPanel. */

import { useCallback } from 'react';
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
import '../Meeting/CodeExplorerCanvas';
import '../Meeting/LivePreviewCanvas';
import '../Meeting/TestDashboardCanvas';
import '../Meeting/ThemePickerCanvas';
import '../Meeting/WhiteboardCanvas';

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
  /** Save canvas artifacts then end the meeting. */
  const handleSaveAndEnd = useCallback(async () => {
    if (onMaterialize && canvasState.data && Object.keys(canvasState.data).length > 0) {
      try {
        await onMaterialize(canvasState.data);
      } catch {
        // Best-effort save -- still end the meeting
      }
    }
    onEndMeeting();
  }, [onMaterialize, canvasState.data, onEndMeeting]);

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
          <div className="flex gap-2">
            <button
              onClick={handleSaveAndEnd}
              className="px-3 py-1 rounded-lg text-xs cursor-pointer border border-green-500/30 text-green-400 hover:bg-green-950/40 hover:text-green-300 transition-colors"
            >
              Save & End
            </button>
          </div>
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
