import type { PlanState, GoalConfidence } from '../../types';

export interface PlanStatePanelProps {
  plan: PlanState;
}

const CONFIDENCE_BADGE: Record<GoalConfidence, { label: string; color: string }> = {
  vague: { label: 'Vague', color: 'bg-red-400/20 text-red-400' },
  rough: { label: 'Rough', color: 'bg-accent-gold/20 text-accent-gold' },
  solid: { label: 'Solid', color: 'bg-accent-mint/20 text-accent-mint' },
};

// Blockly hues mapped to Tailwind accent colors
const PRIMITIVE_COLORS = {
  goal: 'accent-sky',       // hue 210
  promise: 'accent-mint',   // hue 135
  proof: 'accent-coral',    // hue 30
  skill: 'pink-400',        // hue 315
  portal: 'accent-lavender', // hue 260
  deploy: 'accent-gold',    // hue 50
} as const;

type PrimitiveStatus = 'empty' | 'partial' | 'decided';

function getGoalStatus(plan: PlanState): PrimitiveStatus {
  if (!plan.goal.description) return 'empty';
  if (plan.goal.confidence === 'solid') return 'decided';
  return 'partial';
}

function getPromiseStatus(plan: PlanState): PrimitiveStatus {
  if (plan.promises.length === 0) return 'empty';
  if (plan.promises.length >= 2 && plan.promises.some((p) => p.proofs.length > 0)) return 'decided';
  return 'partial';
}

function getSkillStatus(plan: PlanState): PrimitiveStatus {
  if (plan.skills.length === 0) return 'empty';
  return 'decided';
}

function getPortalStatus(plan: PlanState): PrimitiveStatus {
  if (plan.portals.length === 0) return 'empty';
  return 'decided';
}

function getDeployStatus(plan: PlanState): PrimitiveStatus {
  if (!plan.deploy.target) return 'empty';
  return 'decided';
}

function statusStyle(status: PrimitiveStatus): string {
  switch (status) {
    case 'empty': return 'border-dashed border-atelier-text-muted/30';
    case 'partial': return 'border-accent-gold/50 bg-accent-gold/5';
    case 'decided': return 'border-accent-mint/50 bg-accent-mint/5';
  }
}

function StatusDot({ status }: { status: PrimitiveStatus }) {
  const colors: Record<PrimitiveStatus, string> = {
    empty: 'bg-atelier-text-muted/30',
    partial: 'bg-accent-gold',
    decided: 'bg-accent-mint',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]} shrink-0`}
      aria-label={status}
    />
  );
}

function SectionHeader({
  label,
  color,
  status,
}: {
  label: string;
  color: string;
  status: PrimitiveStatus;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className={`w-3 h-0.5 rounded-full bg-${color}`} />
      <span className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide">
        {label}
      </span>
      <StatusDot status={status} />
    </div>
  );
}

export default function PlanStatePanel({ plan }: PlanStatePanelProps) {
  const goalStatus = getGoalStatus(plan);
  const promiseStatus = getPromiseStatus(plan);
  const skillStatus = getSkillStatus(plan);
  const portalStatus = getPortalStatus(plan);
  const deployStatus = getDeployStatus(plan);

  return (
    <div className="space-y-4 p-4" data-testid="plan-state-panel">
      {/* Goal */}
      <div className={`rounded-xl border p-3 transition-all duration-300 ${statusStyle(goalStatus)}`}>
        <SectionHeader label="Goal" color={PRIMITIVE_COLORS.goal} status={goalStatus} />
        {plan.goal.description ? (
          <div>
            <p className="text-sm text-atelier-text">{plan.goal.description}</p>
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${CONFIDENCE_BADGE[plan.goal.confidence].color}`}
              data-testid="confidence-badge"
            >
              {CONFIDENCE_BADGE[plan.goal.confidence].label}
            </span>
          </div>
        ) : (
          <p className="text-xs text-atelier-text-muted italic">Not yet defined</p>
        )}
      </div>

      {/* Promises */}
      <div className={`rounded-xl border p-3 transition-all duration-300 ${statusStyle(promiseStatus)}`}>
        <SectionHeader label="Promises" color={PRIMITIVE_COLORS.promise} status={promiseStatus} />
        {plan.promises.length > 0 ? (
          <ul className="space-y-1.5">
            {plan.promises.map((p, i) => (
              <li key={i} className="text-sm text-atelier-text">
                <span className="text-accent-mint mr-1">&#8226;</span>
                {p.description}
                {p.proofs.length > 0 && (
                  <ul className="ml-4 mt-0.5 space-y-0.5">
                    {p.proofs.map((proof, j) => (
                      <li key={j} className="text-xs text-atelier-text-secondary">
                        <span className="text-accent-coral mr-1">&#9656;</span>
                        {proof.description}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-atelier-text-muted italic">No promises yet</p>
        )}
      </div>

      {/* Skills */}
      <div className={`rounded-xl border p-3 transition-all duration-300 ${statusStyle(skillStatus)}`}>
        <SectionHeader label="Skills" color={PRIMITIVE_COLORS.skill} status={skillStatus} />
        {plan.skills.length > 0 ? (
          <ul className="space-y-1">
            {plan.skills.map((s, i) => (
              <li key={i} className="text-sm text-atelier-text">
                <span className="font-medium">{s.name}</span>
                {s.description && (
                  <span className="text-atelier-text-muted text-xs ml-1">- {s.description}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-atelier-text-muted italic">No skills yet</p>
        )}
      </div>

      {/* Portals */}
      <div className={`rounded-xl border p-3 transition-all duration-300 ${statusStyle(portalStatus)}`}>
        <SectionHeader label="Portals" color={PRIMITIVE_COLORS.portal} status={portalStatus} />
        {plan.portals.length > 0 ? (
          <ul className="space-y-1">
            {plan.portals.map((p, i) => (
              <li key={i} className="text-sm text-atelier-text flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs bg-accent-lavender/20 text-accent-lavender px-1.5 py-0.5 rounded-full">
                  {p.subtype}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-atelier-text-muted italic">No portals yet</p>
        )}
      </div>

      {/* Deploy */}
      <div className={`rounded-xl border p-3 transition-all duration-300 ${statusStyle(deployStatus)}`}>
        <SectionHeader label="Deploy" color={PRIMITIVE_COLORS.deploy} status={deployStatus} />
        {plan.deploy.target ? (
          <div>
            <span className="text-sm text-atelier-text font-medium capitalize">{plan.deploy.target}</span>
            {plan.deploy.constraints.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {plan.deploy.constraints.map((c, i) => (
                  <li key={i} className="text-xs text-atelier-text-secondary">{c}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-atelier-text-muted italic">Not yet decided</p>
        )}
      </div>

      {/* Open Questions */}
      {plan.open_questions.length > 0 && (
        <div className="rounded-xl border border-border-subtle p-3">
          <div className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-1">
            Open Questions
          </div>
          <ul className="space-y-1">
            {plan.open_questions.map((q, i) => (
              <li key={i} className="text-xs text-atelier-text-muted">
                <span className="mr-1">?</span>{q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
