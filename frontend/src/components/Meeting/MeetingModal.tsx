/** Full-screen meeting modal with agent chat panel and canvas area. */

import { useCallback } from 'react';
import AgentAvatar from './AgentAvatar';
import ChatPanel from './ChatPanel';
import CanvasPanel from './CanvasPanel';
import MeetingLayout from './MeetingLayout';

// Import canvas modules to trigger their registerCanvas() side-effects
import './BlueprintCanvas';
import './BugDetectiveCanvas';
import './CampaignCanvas';
import './DesignPreviewCanvas';
import './ExplainItCanvas';
import './InterfaceDesignerCanvas';
import './LaunchPadCanvas';
import './CodeExplorerCanvas';
import './LivePreviewCanvas';
import './TestDashboardCanvas';
import './ThemePickerCanvas';
import './WhiteboardCanvas';

export interface MeetingMessage {
  role: 'agent' | 'kid';
  content: string;
}

export interface MeetingModalProps {
  meetingId: string;
  agentName: string;
  canvasType: string;
  canvasState: { type: string; data: Record<string, unknown> };
  messages: MeetingMessage[];
  isAgentThinking?: boolean;
  onSendMessage: (content: string) => void;
  onCanvasUpdate: (data: Record<string, unknown>) => void;
  onEndMeeting: () => void;
  onMaterialize?: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
}

export default function MeetingModal({
  meetingId,
  agentName,
  canvasType,
  canvasState,
  messages,
  isAgentThinking = false,
  onSendMessage,
  onCanvasUpdate,
  onEndMeeting,
  onMaterialize,
}: MeetingModalProps) {
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
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-modal-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl w-[90vw] h-[85vh] max-w-6xl mx-4 flex flex-col animate-float-in overflow-hidden">
        <MeetingLayout
          header={
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <AgentAvatar agentName={agentName} size={36} />
                <h2 id="meeting-modal-title" className="text-lg font-display font-bold text-atelier-text">
                  Meeting with {agentName}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAndEnd}
                  className="px-4 py-1.5 rounded-xl text-sm cursor-pointer border border-green-500/30 text-green-400 hover:bg-green-950/40 hover:text-green-300 transition-colors"
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
      </div>
    </div>
  );
}
