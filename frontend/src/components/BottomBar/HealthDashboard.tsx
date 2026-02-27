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
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-accent-mint',
  B: 'text-accent-sky',
  C: 'text-accent-gold',
  D: 'text-accent-coral',
  F: 'text-red-400',
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

export default function HealthDashboard({ healthUpdate, healthSummary }: HealthDashboardProps) {
  // Show summary if available (post-execution)
  if (healthSummary) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <div className="text-center">
            <div className={`text-3xl font-bold ${GRADE_COLORS[healthSummary.grade]}`}>
              {healthSummary.grade}
            </div>
            <div className="text-xs text-atelier-text-muted">Grade</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-atelier-text">{healthSummary.health_score}</div>
            <div className="text-xs text-atelier-text-muted">Health Score</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-atelier-text-secondary">Tasks completed</span>
            <span className="font-medium text-atelier-text">{healthSummary.breakdown.tasks_score}/30</span>
          </div>
          <ProgressBar value={healthSummary.breakdown.tasks_score} max={30} color="bg-accent-sky" />

          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-atelier-text-secondary">Tests passing</span>
            <span className="font-medium text-atelier-text">{healthSummary.breakdown.tests_score}/40</span>
          </div>
          <ProgressBar value={healthSummary.breakdown.tests_score} max={40} color="bg-accent-mint" />

          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-atelier-text-secondary">No corrections needed</span>
            <span className="font-medium text-atelier-text">{healthSummary.breakdown.corrections_score}/20</span>
          </div>
          <ProgressBar value={healthSummary.breakdown.corrections_score} max={20} color="bg-accent-lavender" />

          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-atelier-text-secondary">Under budget</span>
            <span className="font-medium text-atelier-text">{healthSummary.breakdown.budget_score}/10</span>
          </div>
          <ProgressBar value={healthSummary.breakdown.budget_score} max={10} color="bg-accent-gold" />
        </div>
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
