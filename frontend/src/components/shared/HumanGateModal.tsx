import { useState } from 'react';

interface Props {
  taskId: string;
  question: string;
  context: string;
  sessionId: string;
  onClose: () => void;
}

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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg mx-4 w-full">
        <h2 className="text-xl font-bold mb-3">{question}</h2>
        <p className="text-gray-600 text-sm mb-4">{context}</p>

        {showFeedback && (
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Tell me what you'd like to change..."
            className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-4 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-orange-300"
            autoFocus
          />
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium text-sm disabled:opacity-50"
          >
            {showFeedback ? 'Send feedback' : "Let's change something"}
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm disabled:opacity-50"
          >
            Looks good!
          </button>
        </div>
      </div>
    </div>
  );
}
