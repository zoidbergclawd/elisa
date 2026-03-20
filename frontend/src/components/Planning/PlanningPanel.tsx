/** Two-panel Planning Mode layout: left=conversation + question widgets, right=plan state. */

import { useCallback } from 'react';
import ChatPanel from '../Meeting/ChatPanel';
import MeetingLayout from '../Meeting/MeetingLayout';
import PlanStatePanel from './PlanStatePanel';
import PlanSummaryCard from './PlanSummaryCard';
import QuestionWidgetRenderer from './widgets/QuestionWidgetRenderer';
import type {
  PlanState,
  PlanningMessage,
  QuestionWidget,
  PlanningStatus,
} from '../../types';

export interface PlanningPanelProps {
  status: PlanningStatus;
  plan: PlanState;
  conversationHistory: PlanningMessage[];
  currentQuestion: QuestionWidget | null;
  isAgentThinking: boolean;
  error: string | null;
  onSubmitAnswer: (value: string | string[]) => void;
  onSubmitMessage: (content: string) => void;
  onGenerateCanvas: () => void;
}

export default function PlanningPanel({
  status,
  plan,
  conversationHistory,
  currentQuestion,
  isAgentThinking,
  error,
  onSubmitAnswer,
  onSubmitMessage,
  onGenerateCanvas,
}: PlanningPanelProps) {
  const chatMessages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const handleAskMore = useCallback(() => {
    onSubmitMessage("I'd like to think about this more. Can you ask me another question?");
  }, [onSubmitMessage]);

  return (
    <MeetingLayout
      header={
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-lg font-display font-bold text-atelier-text" id="planning-panel-title">
            Planning Mode
          </h2>
          {status === 'generating' && (
            <span className="text-xs text-accent-sky animate-pulse">Generating canvas...</span>
          )}
        </div>
      }
      chatPanel={
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={chatMessages}
              isAgentThinking={isAgentThinking}
              agentName="Planner"
              onSendMessage={onSubmitMessage}
            />
          </div>
          {currentQuestion && (
            <div className="shrink-0 max-h-[50%] overflow-y-auto p-3 border-t border-border-subtle bg-atelier-surface/50" data-testid="question-widget-area">
              <QuestionWidgetRenderer
                question={currentQuestion}
                onAnswer={onSubmitAnswer}
              />
            </div>
          )}
        </div>
      }
      canvasPanel={
        <div className="h-full overflow-y-auto">
          {error && (
            <div className="mb-3 px-4 py-2 rounded-xl text-sm bg-red-950/30 border border-red-500/30 text-red-400" role="alert">
              {error}
            </div>
          )}
          <PlanStatePanel plan={plan} />
          {status === 'ready' && (
            <div className="px-4 pb-4">
              <PlanSummaryCard
                plan={plan}
                summary="Your plan is ready. Generate blocks for the canvas?"
                onGenerateCanvas={onGenerateCanvas}
                onAskMore={handleAskMore}
              />
            </div>
          )}
        </div>
      }
    />
  );
}
