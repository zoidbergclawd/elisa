/** Full-screen Planning Mode modal wrapper. */

import { useCallback, useState } from 'react';
import PlanningPanel from './PlanningPanel';
import type {
  PlanState,
  PlanningMessage,
  QuestionWidget,
  PlanningStatus,
} from '../../types';

export interface PlanningModalProps {
  status: PlanningStatus;
  plan: PlanState;
  conversationHistory: PlanningMessage[];
  currentQuestion: QuestionWidget | null;
  isAgentThinking: boolean;
  error: string | null;
  onSubmitAnswer: (value: string | string[]) => void;
  onSubmitMessage: (content: string) => void;
  onGenerateCanvas: () => void;
  onClose: () => void;
}

export default function PlanningModal({
  status,
  plan,
  conversationHistory,
  currentQuestion,
  isAgentThinking,
  error,
  onSubmitAnswer,
  onSubmitMessage,
  onGenerateCanvas,
  onClose,
}: PlanningModalProps) {
  const [confirmClose, setConfirmClose] = useState(false);

  const handleClose = useCallback(() => {
    if (status === 'active' || status === 'ready') {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }, [status, onClose]);

  const handleConfirmClose = useCallback(() => {
    setConfirmClose(false);
    onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-modal-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl w-[90vw] h-[85vh] max-w-6xl mx-4 flex flex-col animate-float-in overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 id="planning-modal-title" className="text-lg font-display font-bold text-atelier-text">
            Planning Mode
          </h2>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl text-sm cursor-pointer border border-border-subtle text-atelier-text-secondary hover:border-border-medium transition-colors"
            aria-label="Close planning"
          >
            Close
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <PlanningPanel
            status={status}
            plan={plan}
            conversationHistory={conversationHistory}
            currentQuestion={currentQuestion}
            isAgentThinking={isAgentThinking}
            error={error}
            onSubmitAnswer={onSubmitAnswer}
            onSubmitMessage={onSubmitMessage}
            onGenerateCanvas={onGenerateCanvas}
          />
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmClose && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div className="glass-elevated rounded-xl shadow-xl p-6 max-w-sm mx-4" role="alertdialog" aria-labelledby="confirm-close-title">
            <h3 id="confirm-close-title" className="text-sm font-bold text-atelier-text mb-2">
              Leave Planning Mode?
            </h3>
            <p className="text-sm text-atelier-text-secondary mb-4">
              Your planning progress will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmClose(false)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-border-subtle text-atelier-text-secondary hover:border-border-medium transition-colors"
              >
                Keep planning
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-red-500/30 text-red-400 hover:bg-red-950/40 transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
