import { useState } from 'react';
import type { QuestionOption } from '../../../types';

export interface SingleSelectWidgetProps {
  question: string;
  options: QuestionOption[];
  onSelect: (value: string) => void;
}

export default function SingleSelectWidget({
  question,
  options,
  onSelect,
}: SingleSelectWidgetProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');

  const handleSelect = (value: string) => {
    setSelected(value);
    setShowOther(false);
    onSelect(value);
  };

  const handleOtherClick = () => {
    setSelected(null);
    setShowOther(true);
  };

  const handleOtherSubmit = () => {
    const trimmed = otherText.trim();
    if (!trimmed) return;
    onSelect(trimmed);
  };

  return (
    <div className="space-y-2" role="group" aria-label={question}>
      <p className="text-sm font-semibold text-atelier-text mb-3">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              selected === opt.value
                ? 'bg-accent-sky/20 border-accent-sky/50 text-atelier-text border'
                : 'bg-atelier-surface border border-border-subtle hover:border-border-medium text-atelier-text-secondary'
            }`}
            aria-pressed={selected === opt.value}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={handleOtherClick}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            showOther
              ? 'bg-accent-sky/20 border-accent-sky/50 text-atelier-text border'
              : 'bg-atelier-surface border border-border-subtle hover:border-border-medium text-atelier-text-secondary'
          }`}
          aria-pressed={showOther}
        >
          Something else
        </button>
      </div>
      {showOther && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOtherSubmit();
            }}
            placeholder="Tell me more..."
            className="flex-1 rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
            aria-label="Custom answer"
            autoFocus
          />
          <button
            type="button"
            onClick={handleOtherSubmit}
            disabled={!otherText.trim()}
            className="go-btn px-3 py-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
