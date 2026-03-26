import { useState } from 'react';
import { authFetch } from '../../lib/apiClient';

interface CheckpointChoice {
  id: string;
  label: string;
  description: string;
}

interface Props {
  checkpointId: string;
  checkpointType: 'visual' | 'choice' | 'progress';
  taskId: string;
  sessionId: string;
  screenshotBase64?: string;
  choices?: CheckpointChoice[];
  summary?: string;
  progressPct: number;
  narratorMessage?: string;
  onClose: () => void;
}

export default function CheckpointModal({
  checkpointId,
  checkpointType,
  sessionId,
  screenshotBase64,
  choices,
  summary,
  progressPct,
  narratorMessage,
  onClose,
}: Props) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const respond = async (response: 'approve' | 'reject' | 'choice', choiceId?: string) => {
    setSubmitting(true);
    await authFetch(`/api/sessions/${sessionId}/checkpoint`, {
      method: 'POST',
      body: JSON.stringify({
        checkpoint_id: checkpointId,
        response,
        choice_id: choiceId,
        comment: comment || undefined,
      }),
    });
    onClose();
  };

  const title =
    checkpointType === 'visual' ? 'How does this look?' :
    checkpointType === 'choice' ? 'Your decision!' :
    'Progress check-in';

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkpoint-modal-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg mx-4 w-full animate-float-in">
        <h2 id="checkpoint-modal-title" className="text-xl font-display font-bold mb-2 text-atelier-text">
          {title}
        </h2>

        {/* Progress bar */}
        <div className="w-full bg-atelier-surface rounded-full h-2 mb-3">
          <div
            className="bg-accent-teal h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-atelier-text-muted mb-3">{progressPct}% done</p>

        {/* Summary */}
        {summary && (
          <p className="text-sm text-atelier-text-secondary mb-3">{summary}</p>
        )}

        {/* Narrator message */}
        {narratorMessage && (
          <p className="text-sm italic text-atelier-text-muted mb-3">{narratorMessage}</p>
        )}

        {/* Screenshot for visual checkpoints */}
        {checkpointType === 'visual' && screenshotBase64 && (
          <div className="mb-4 rounded-xl overflow-hidden border border-border-medium">
            <img
              src={`data:image/png;base64,${screenshotBase64}`}
              alt="Current build preview"
              className="w-full"
            />
          </div>
        )}

        {/* Choices for choice checkpoints */}
        {checkpointType === 'choice' && choices && choices.length > 0 && (
          <div className="space-y-2 mb-4">
            {choices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => setSelectedChoice(choice.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selectedChoice === choice.id
                    ? 'border-accent-teal bg-accent-teal/10'
                    : 'border-border-medium hover:border-accent-teal/40'
                }`}
              >
                <p className="font-medium text-sm text-atelier-text">{choice.label}</p>
                <p className="text-xs text-atelier-text-muted mt-1">{choice.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Comment field */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any feedback? (optional)"
          className="w-full bg-atelier-surface border border-border-medium rounded-xl p-3 text-sm mb-4 min-h-[60px] text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-teal/40 focus:border-accent-teal/40"
        />

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          {checkpointType === 'choice' ? (
            <button
              onClick={() => respond('choice', selectedChoice ?? undefined)}
              disabled={submitting || !selectedChoice}
              className="go-btn px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50"
            >
              Pick this one!
            </button>
          ) : (
            <>
              <button
                onClick={() => respond('reject')}
                disabled={submitting}
                className="px-4 py-2 bg-accent-coral/15 text-accent-coral rounded-xl hover:bg-accent-coral/25 font-medium text-sm disabled:opacity-50 transition-colors"
              >
                Let's change something
              </button>
              <button
                onClick={() => respond('approve')}
                disabled={submitting}
                className="go-btn px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50"
              >
                Looks great!
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
