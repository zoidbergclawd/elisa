import type { HealthHistoryEntry, SystemLevel } from '../../types';
import HealthGradeCard from '../shared/HealthGradeCard';

interface HealthUpdate {
  tasks_done: number;
  tasks_total: number;
  tests_passing: number;
  tests_total: number;
  tokens_used: number;
  health_score: number;
}

interface HealthSummary {
  health_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    tasks_score: number;
    tests_score: number;
    corrections_score: number;
    budget_score: number;
  };
}

interface HealthDashboardProps {
  healthUpdate: HealthUpdate | null;
  healthSummary: HealthSummary | null;
  healthHistory?: HealthHistoryEntry[];
  systemLevel?: SystemLevel;
}

const GRADE_BAR_COLORS: Record<string, string> = {
  A: 'bg-accent-mint',
  B: 'bg-accent-sky',
  C: 'bg-accent-gold',
  D: 'bg-accent-coral',
  F: 'bg-red-400',
};

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-atelier-surface rounded-full overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-300 rounded-full`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function HealthTrend({ entries }: { entries: HealthHistoryEntry[] }) {
  if (entries.length === 0) return null;

  const lastIndex = entries.length - 1;

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle">
      <div className="text-xs font-medium text-atelier-text-secondary mb-2">Trend</div>
      <div className="flex items-end gap-1">
        {entries.map((entry, i) => {
          const barHeight = Math.max(entry.score, 4);
          const isLatest = i === lastIndex;
          const barColor = GRADE_BAR_COLORS[entry.grade] ?? 'bg-atelier-surface';

          return (
            <div
              key={`${entry.timestamp}-${i}`}
              className="flex flex-col items-center flex-1 min-w-0"
              title={`${entry.goal} - ${entry.score} (${entry.grade}) - ${formatTimestamp(entry.timestamp)}`}
            >
              <div className="text-[9px] text-atelier-text-muted mb-0.5">{entry.grade}</div>
              <div
                className={`w-full rounded-sm transition-all ${barColor} ${isLatest ? 'ring-1 ring-accent-lavender' : ''}`}
                style={{ height: `${barHeight * 0.4}px` }}
              />
              <div className="text-[8px] text-atelier-text-muted mt-0.5 truncate w-full text-center">
                {formatTimestamp(entry.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HealthDashboard({ healthUpdate, healthSummary, healthHistory = [], systemLevel }: HealthDashboardProps) {
  const showTrend = systemLevel === 'architect' && healthHistory.length > 0;

  // Show summary if available (post-execution)
  if (healthSummary) {
    return (
      <div className="p-4">
        <HealthGradeCard
          grade={healthSummary.grade}
          score={healthSummary.health_score}
          breakdown={healthSummary.breakdown}
        />
        {showTrend && <HealthTrend entries={healthHistory} />}
      </div>
    );
  }

  // Show real-time update during execution
  if (healthUpdate) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-lg font-bold text-atelier-text">Score: {healthUpdate.health_score}</div>
          <div className="text-xs text-atelier-text-muted">Live</div>
        </div>
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-atelier-text-secondary">Tasks</span>
              <span className="text-atelier-text">{healthUpdate.tasks_done}/{healthUpdate.tasks_total}</span>
            </div>
            <ProgressBar value={healthUpdate.tasks_done} max={healthUpdate.tasks_total} color="bg-accent-sky" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-atelier-text-secondary">Tests</span>
              <span className="text-atelier-text">{healthUpdate.tests_passing}/{healthUpdate.tests_total}</span>
            </div>
            <ProgressBar value={healthUpdate.tests_passing} max={healthUpdate.tests_total} color="bg-accent-mint" />
          </div>
          <div className="text-xs text-atelier-text-muted">
            Tokens used: {healthUpdate.tokens_used.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  return <p className="text-sm text-atelier-text-muted p-4">Health data will appear during a build</p>;
}
