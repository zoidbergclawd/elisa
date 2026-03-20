/** Dismissible learning summary card shown after planning canvas generation. */

import type { LearningSummary } from '../../types';

export interface LearningSummaryCardProps {
  summary: LearningSummary;
  onDismiss: () => void;
}

export default function LearningSummaryCard({
  summary,
  onDismiss,
}: LearningSummaryCardProps) {
  const hasSections =
    summary.decisions.length > 0 ||
    summary.patterns_discovered.length > 0 ||
    summary.tradeoffs.length > 0 ||
    summary.next_time_suggestion;

  if (!hasSections) return null;

  return (
    <div
      className="rounded-2xl border border-accent-lavender/30 bg-accent-lavender/5 p-4 space-y-3"
      data-testid="learning-summary-card"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-atelier-text">What You Learned</h3>
        <button
          onClick={onDismiss}
          className="text-atelier-text-muted hover:text-atelier-text text-sm cursor-pointer"
          aria-label="Dismiss learning summary"
        >
          x
        </button>
      </div>

      {summary.decisions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-accent-lavender uppercase tracking-wide mb-1">
            Decisions Made
          </h4>
          <ul className="space-y-0.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-sm text-atelier-text-secondary">- {d}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.patterns_discovered.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-accent-mint uppercase tracking-wide mb-1">
            Patterns Discovered
          </h4>
          <ul className="space-y-0.5">
            {summary.patterns_discovered.map((p, i) => (
              <li key={i} className="text-sm text-atelier-text-secondary">- {p}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.tradeoffs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-accent-gold uppercase tracking-wide mb-1">
            Tradeoffs
          </h4>
          <ul className="space-y-0.5">
            {summary.tradeoffs.map((t, i) => (
              <li key={i} className="text-sm text-atelier-text-secondary">- {t}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.next_time_suggestion && (
        <div>
          <h4 className="text-xs font-semibold text-accent-sky uppercase tracking-wide mb-1">
            Next Time
          </h4>
          <p className="text-sm text-atelier-text-secondary">{summary.next_time_suggestion}</p>
        </div>
      )}
    </div>
  );
}
