import { useState } from 'react';

interface Props {
  taskId: string;
  question: string;
  context: string;
  sessionId: string;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function HumanGateModal({ taskId, question, context, sessionId, onClose }: Props) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    await fetch(`/api/sessions/${sessionId}/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    onClose();
  };

  const handleReject = async () => {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    setSubmitting(true);
    await fetch(`/api/sessions/${sessionId}/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: false, feedback }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="gate-modal-title">
      <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg mx-4 w-full animate-float-in">
        <h2 id="gate-modal-title" className="text-xl font-display font-bold mb-3 text-atelier-text">{question}</h2>
        <p className="text-atelier-text-secondary text-sm mb-4">{context}</p>

        {showFeedback && (
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Tell me what you'd like to change..."
            className="w-full bg-atelier-surface border border-border-medium rounded-xl p-3 text-sm mb-4 min-h-[80px] text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-coral/40 focus:border-accent-coral/40"
            autoFocus
          />
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-2 bg-accent-coral/15 text-accent-coral rounded-xl hover:bg-accent-coral/25 font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {showFeedback ? 'Send feedback' : "Let's change something"}
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="go-btn px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50"
          >
            Looks good!
          </button>
        </div>
      </div>
    </div>
  );
}
