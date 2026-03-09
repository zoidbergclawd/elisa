interface HealthBreakdown {
  tasks_score: number;
  tests_score: number;
  corrections_score: number;
  budget_score: number;
}

interface HealthGradeCardProps {
  grade: string;
  score: number;
  breakdown: HealthBreakdown;
  compact?: boolean;
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

export default function HealthGradeCard({ grade, score, breakdown, compact }: HealthGradeCardProps) {
  const gradeSize = compact ? 'text-xl' : 'text-3xl';
  const scoreSize = compact ? 'text-lg' : 'text-2xl';
  const gapClass = compact ? 'gap-3 mb-2' : 'gap-4 mb-3';
  const spaceClass = compact ? 'space-y-1' : 'space-y-1.5';

  return (
    <div data-testid="health-grade-card">
      <div className={`flex items-center ${gapClass}`}>
        <div className="text-center">
          <div className={`${gradeSize} font-bold ${GRADE_COLORS[grade] ?? 'text-atelier-text'}`}>
            {grade}
          </div>
          <div className="text-xs text-atelier-text-muted">Grade</div>
        </div>
        <div className="text-center">
          <div className={`${scoreSize} font-bold text-atelier-text`}>{score}</div>
          <div className="text-xs text-atelier-text-muted">Health Score</div>
        </div>
      </div>
      <div className={spaceClass}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-atelier-text-secondary">Tasks completed</span>
          <span className="font-medium text-atelier-text">{breakdown.tasks_score}/30</span>
        </div>
        <ProgressBar value={breakdown.tasks_score} max={30} color="bg-accent-sky" />

        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-atelier-text-secondary">Tests passing</span>
          <span className="font-medium text-atelier-text">{breakdown.tests_score}/40</span>
        </div>
        <ProgressBar value={breakdown.tests_score} max={40} color="bg-accent-mint" />

        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-atelier-text-secondary">No corrections needed</span>
          <span className="font-medium text-atelier-text">{breakdown.corrections_score}/20</span>
        </div>
        <ProgressBar value={breakdown.corrections_score} max={20} color="bg-accent-lavender" />

        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-atelier-text-secondary">Under budget</span>
          <span className="font-medium text-atelier-text">{breakdown.budget_score}/10</span>
        </div>
        <ProgressBar value={breakdown.budget_score} max={10} color="bg-accent-gold" />
      </div>
    </div>
  );
}
