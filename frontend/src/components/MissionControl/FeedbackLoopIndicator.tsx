import type { CorrectionCycleState } from '../../types';

interface Props {
  cycle: CorrectionCycleState;
}

const STEP_LABELS: Record<string, string> = {
  diagnosing: 'Diagnosing...',
  fixing: 'Fixing...',
  retesting: 'Retesting...',
};

/**
 * Shows a circular arrow animation and attempt counter when a correction
 * cycle is active on a task. Designed to overlay or sit beside a task
 * node in the DAG.
 */
export default function FeedbackLoopIndicator({ cycle }: Props) {
  const { attempt_number, max_attempts, step, converged } = cycle;

  if (converged) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600" data-testid="feedback-loop-indicator">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Converged</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs" data-testid="feedback-loop-indicator">
      {/* Circular arrow animation */}
      <div className="relative w-5 h-5">
        <svg
          className="w-5 h-5 text-amber-500 animate-spin"
          style={{ animationDuration: '2s' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M21 12a9 9 0 1 1-6.22-8.56"
            strokeLinecap="round"
          />
          <path
            d="M21 3v5h-5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex flex-col">
        <span className="font-medium text-amber-600">
          Attempt {attempt_number + 1} of {max_attempts}
        </span>
        {step && (
          <span className="text-atelier-text-muted">
            {STEP_LABELS[step] ?? step}
          </span>
        )}
      </div>
    </div>
  );
}
