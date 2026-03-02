import type { CorrectionCycleState } from '../../types';

interface Props {
  cycles: Record<string, CorrectionCycleState>;
}

const TREND_CONFIG = {
  improving: { label: 'Improving', color: 'text-emerald-600', arrow: 'M5 15l7-7 7 7' },
  stalled: { label: 'Stalled', color: 'text-amber-500', arrow: 'M4 12h16' },
  diverging: { label: 'Diverging', color: 'text-red-500', arrow: 'M5 9l7 7 7-7' },
} as const;

/**
 * Panel showing convergence information for all active correction cycles.
 * Displays attempt history, trend indicators, and teaching moments.
 */
export default function ConvergencePanel({ cycles }: Props) {
  const activeCycles = Object.values(cycles).filter(c => c.attempts.length > 0);

  if (activeCycles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 p-3" data-testid="convergence-panel">
      <h3 className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide">
        Feedback Loops
      </h3>

      {activeCycles.map(cycle => (
        <CycleCard key={cycle.task_id} cycle={cycle} />
      ))}
    </div>
  );
}

function CycleCard({ cycle }: { cycle: CorrectionCycleState }) {
  const { task_id, trend, converged, attempts, tests_passing, tests_total } = cycle;
  const trendConfig = trend ? TREND_CONFIG[trend] : null;

  // Short task ID for display
  const shortId = task_id.length > 20 ? task_id.slice(0, 20) + '...' : task_id;

  return (
    <div className="rounded-lg border border-border-subtle bg-atelier-surface/50 p-2.5 text-xs space-y-2">
      {/* Header with task name and trend */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-atelier-text truncate" title={task_id}>
          {shortId}
        </span>
        {trendConfig && (
          <span className={`flex items-center gap-1 ${trendConfig.color}`} data-testid="trend-indicator">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={trendConfig.arrow} />
            </svg>
            <span className="font-medium">{trendConfig.label}</span>
          </span>
        )}
      </div>

      {/* Attempt history */}
      {attempts.length > 0 && (
        <div className="space-y-1">
          {attempts.map(attempt => (
            <div key={attempt.attempt_number} className="flex items-center justify-between text-atelier-text-muted">
              <span>Attempt {attempt.attempt_number + 1}:</span>
              <span className={
                attempt.status === 'passed' ? 'text-emerald-600 font-medium' :
                attempt.status === 'failed' ? 'text-red-500' :
                'text-amber-500'
              }>
                {attempt.tests_passing !== undefined && attempt.tests_total !== undefined
                  ? `${attempt.tests_passing}/${attempt.tests_total} tests passing`
                  : attempt.status === 'passed' ? 'Passed'
                  : attempt.status === 'failed' ? 'Failed'
                  : 'In progress...'
                }
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Current test score */}
      {tests_passing !== undefined && tests_total !== undefined && tests_total > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-atelier-surface rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${converged ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.round((tests_passing / tests_total) * 100)}%` }}
            />
          </div>
          <span className="text-atelier-text-muted font-mono whitespace-nowrap">
            {tests_passing}/{tests_total}
          </span>
        </div>
      )}

      {/* Teaching moments */}
      {converged && (
        <p className="text-emerald-700 bg-emerald-50 rounded px-2 py-1.5 leading-relaxed" data-testid="teaching-converged">
          Notice how each attempt got closer? That's convergence -- the system gets better each time it loops.
        </p>
      )}
      {!converged && trend === 'stalled' && (
        <p className="text-amber-700 bg-amber-50 rounded px-2 py-1.5 leading-relaxed" data-testid="teaching-stalled">
          The system isn't getting better on its own. Sometimes feedback loops need human help.
        </p>
      )}
    </div>
  );
}
