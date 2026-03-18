import { useState } from 'react';
import type { QuestionOption } from '../../../types';

export interface MultiSelectWidgetProps {
  question: string;
  options: QuestionOption[];
  onSubmit: (values: string[]) => void;
}

export default function MultiSelectWidget({
  question,
  options,
  onSubmit,
}: MultiSelectWidgetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onSubmit(Array.from(selected));
  };

  return (
    <div className="space-y-2" role="group" aria-label={question}>
      <p className="text-sm font-semibold text-atelier-text mb-3">{question}</p>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected.has(opt.value)
                ? 'border-accent-sky/50 bg-accent-sky/10'
                : 'border-border-subtle hover:border-border-medium'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(opt.value)}
              onChange={() => toggle(opt.value)}
              className="accent-accent-sky"
            />
            <span className="text-sm text-atelier-text">{opt.label}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={selected.size === 0}
        className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
      >
        Confirm ({selected.size})
      </button>
    </div>
  );
}
