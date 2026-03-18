import type { PlanState } from '../../types';

export interface PlanSummaryCardProps {
  plan: PlanState;
  summary: string;
  onGenerateCanvas: () => void;
  onAskMore: () => void;
}

interface ReadinessCheck {
  label: string;
  met: boolean;
}

function getReadinessChecklist(plan: PlanState): ReadinessCheck[] {
  return [
    { label: 'Goal is solid', met: plan.goal.confidence === 'solid' },
    { label: '2+ promises', met: plan.promises.length >= 2 },
    { label: '1+ portal', met: plan.portals.length >= 1 },
    { label: '1+ skill', met: plan.skills.length >= 1 },
    { label: 'Deploy target set', met: plan.deploy.target !== null },
  ];
}

export default function PlanSummaryCard({
  plan,
  summary,
  onGenerateCanvas,
  onAskMore,
}: PlanSummaryCardProps) {
  const checks = getReadinessChecklist(plan);
  const allMet = checks.every((c) => c.met);

  return (
    <div className="rounded-2xl border border-accent-mint/30 bg-accent-mint/5 p-4 space-y-3" data-testid="plan-summary-card">
      <h3 className="text-sm font-bold text-atelier-text">Plan Ready</h3>
      <p className="text-sm text-atelier-text-secondary">{summary}</p>

      <ul className="space-y-1" aria-label="Readiness checklist">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-xs">
            <span className={check.met ? 'text-accent-mint' : 'text-atelier-text-muted'}>
              {check.met ? '\u2713' : '\u2717'}
            </span>
            <span className={check.met ? 'text-atelier-text' : 'text-atelier-text-muted'}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onGenerateCanvas}
          disabled={!allMet}
          className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Generate Canvas
        </button>
        <button
          type="button"
          onClick={onAskMore}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-border-subtle text-atelier-text-secondary hover:border-border-medium transition-all cursor-pointer"
        >
          Ask me more
        </button>
      </div>
    </div>
  );
}
