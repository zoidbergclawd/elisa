import { useState, useCallback } from 'react';
import type { QuestionOption } from '../../../types';

export interface RankPrioritiesWidgetProps {
  question: string;
  options: QuestionOption[];
  onSubmit: (rankedValues: string[]) => void;
}

export default function RankPrioritiesWidget({
  question,
  options,
  onSubmit,
}: RankPrioritiesWidgetProps) {
  const [items, setItems] = useState<QuestionOption[]>(options);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const swap = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      swap(dragIndex, targetIndex);
    }
    setDragIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      swap(index, index - 1);
      setFocusedIndex(index - 1);
    } else if (e.key === 'ArrowDown' && index < items.length - 1) {
      e.preventDefault();
      swap(index, index + 1);
      setFocusedIndex(index + 1);
    }
  };

  const handleConfirm = () => {
    onSubmit(items.map((item) => item.value));
  };

  return (
    <div className="space-y-2" role="group" aria-label={question}>
      <p className="text-sm font-semibold text-atelier-text mb-3">{question}</p>
      <p className="text-xs text-atelier-text-muted mb-2">
        Drag to reorder or use arrow keys
      </p>
      <ol className="space-y-1" aria-label="Priority list">
        {items.map((item, index) => (
          <li
            key={item.value}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onKeyDown={(e) => handleKeyDown(e, index)}
            tabIndex={0}
            ref={(el) => {
              if (focusedIndex === index && el) {
                el.focus();
                setFocusedIndex(null);
              }
            }}
            role="listitem"
            aria-label={`Priority ${index + 1}: ${item.label}`}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-grab transition-all select-none ${
              dragIndex === index
                ? 'opacity-50 border-accent-sky/50 bg-accent-sky/10'
                : 'border-border-subtle hover:border-border-medium bg-atelier-surface'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-accent-sky/20 text-accent-sky text-xs font-bold flex items-center justify-center shrink-0">
              {index + 1}
            </span>
            <span className="text-sm text-atelier-text flex-1">{item.label}</span>
            <span className="text-atelier-text-muted text-xs" aria-hidden="true">
              &#x2630;
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={handleConfirm}
        className="go-btn px-4 py-2 rounded-xl text-sm font-medium cursor-pointer mt-2"
      >
        Confirm order
      </button>
    </div>
  );
}
