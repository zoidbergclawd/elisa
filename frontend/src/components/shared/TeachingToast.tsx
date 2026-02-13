import { useState, useEffect } from 'react';
import type { TeachingMoment } from '../../types';

interface Props {
  moment: TeachingMoment | null;
  onDismiss: () => void;
}

export default function TeachingToast({ moment, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!moment) return;
    setExpanded(false); // eslint-disable-line react-hooks/set-state-in-effect
    const timer = setTimeout(onDismiss, 10000);
    return () => clearTimeout(timer);
  }, [moment, onDismiss]);

  if (!moment) return null;

  return (
    <div
      className="fixed right-4 top-20 w-80 glass-elevated rounded-xl shadow-lg p-4 z-50 animate-float-in border-l-2 border-l-accent-gold"
      role="alert"
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-atelier-text">{moment.headline}</p>
        <button
          onClick={onDismiss}
          className="text-atelier-text-muted hover:text-atelier-text ml-2 transition-colors"
          aria-label="Dismiss notification"
        >
          x
        </button>
      </div>
      <p className="text-xs text-atelier-text-secondary mt-1">{moment.explanation}</p>
      {moment.tell_me_more && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent-gold hover:text-accent-gold/80 mt-1.5 underline transition-colors"
          >
            {expanded ? 'Show less' : 'Tell me more'}
          </button>
          {expanded && (
            <p className="text-xs text-atelier-text-muted mt-1">{moment.tell_me_more}</p>
          )}
        </>
      )}
    </div>
  );
}
