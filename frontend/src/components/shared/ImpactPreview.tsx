import { useState } from 'react';

interface RequirementDetail {
  description: string;
  estimated_task_count: number;
  test_linked: boolean;
  weight: number;
  dependents: number;
}

interface ImpactPreviewProps {
  estimate: {
    estimated_tasks: number;
    complexity: 'simple' | 'moderate' | 'complex';
    heaviest_requirements: string[];
    requirement_details?: RequirementDetail[];
  };
}

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: 'text-accent-mint',
  moderate: 'text-accent-gold',
  complex: 'text-accent-coral',
};

const COMPLEXITY_LABELS: Record<string, string> = {
  simple: 'Simple',
  moderate: 'Moderate',
  complex: 'Complex',
};

const BAR_COLORS: Record<string, string> = {
  simple: 'bg-accent-mint',
  moderate: 'bg-accent-gold',
  complex: 'bg-accent-coral',
};

function getComplexityTier(weight: number): 'simple' | 'moderate' | 'complex' {
  if (weight <= 1) return 'simple';
  if (weight <= 2) return 'moderate';
  return 'complex';
}

function findHeaviestIndex(details: RequirementDetail[]): number {
  if (details.length === 0) return -1;
  let maxWeight = -1;
  let maxIdx = 0;
  for (let i = 0; i < details.length; i++) {
    if (details[i].weight > maxWeight) {
      maxWeight = details[i].weight;
      maxIdx = i;
    }
  }
  return maxIdx;
}

export default function ImpactPreview({ estimate }: ImpactPreviewProps) {
  const [hoveredReqIndex, setHoveredReqIndex] = useState<number | null>(null);
  const details = estimate.requirement_details ?? [];
  const heaviestIdx = findHeaviestIndex(details);
  const maxWeight = details.length > 0 ? Math.max(...details.map((d) => d.weight)) : 1;

  // Find which heaviest_requirements descriptions map to which detail indices
  const heaviestSet = new Set(estimate.heaviest_requirements);

  // Get the hovered requirement's detail for tooltip info
  const hoveredDetail = hoveredReqIndex !== null ? details[hoveredReqIndex] : null;

  return (
    <div className="glass-panel rounded-xl p-4 border border-border-subtle">
      <h3 className="text-sm font-semibold text-atelier-text mb-2">Build Preview</h3>
      <div className="flex items-center gap-4 mb-2">
        <div className="text-center">
          <div className="text-2xl font-bold text-accent-sky">~{estimate.estimated_tasks}</div>
          <div className="text-xs text-atelier-text-muted">tasks</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-semibold ${COMPLEXITY_COLORS[estimate.complexity]}`}>
            {COMPLEXITY_LABELS[estimate.complexity]}
          </div>
          <div className="text-xs text-atelier-text-muted">complexity</div>
        </div>
      </div>
      {estimate.heaviest_requirements.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-atelier-text-secondary mb-1">Most work comes from:</p>
          <ul className="text-xs text-atelier-text-muted space-y-0.5">
            {estimate.heaviest_requirements.map((req, i) => {
              // Find matching detail index for this requirement description
              const detailIndex = details.findIndex((d) => d.description === req);
              const isHovered = hoveredReqIndex !== null && detailIndex === hoveredReqIndex;
              const isHighlighted =
                hoveredReqIndex !== null &&
                detailIndex !== -1 &&
                hoveredDetail !== null &&
                heaviestSet.has(details[hoveredReqIndex]?.description ?? '');
              return (
                <li
                  key={i}
                  className={`truncate cursor-default rounded px-1 transition-colors ${
                    isHovered
                      ? 'bg-accent-sky/20 border-l-2 border-accent-sky'
                      : isHighlighted
                        ? 'bg-accent-sky/10'
                        : ''
                  }`}
                  onMouseEnter={() => {
                    if (detailIndex !== -1) setHoveredReqIndex(detailIndex);
                  }}
                  onMouseLeave={() => setHoveredReqIndex(null)}
                  data-testid={`req-item-${i}`}
                >
                  - {req}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredDetail && (
        <div
          className="mt-2 p-2 rounded-lg bg-atelier-bg/80 border border-border-subtle text-xs"
          data-testid="req-tooltip"
        >
          <p className="text-atelier-text-secondary">
            ~{hoveredDetail.estimated_task_count} {hoveredDetail.estimated_task_count === 1 ? 'task' : 'tasks'}
            {hoveredDetail.test_linked && ' + test coverage'}
          </p>
          {hoveredDetail.dependents > 0 && (
            <p className="text-atelier-text-muted mt-0.5">
              {hoveredDetail.dependents} of your requirements depend on this
            </p>
          )}
        </div>
      )}

      {/* Dependency awareness prompts */}
      {details.length > 0 && heaviestIdx !== -1 && hoveredReqIndex === null && (
        <div className="mt-2" data-testid="dependency-prompt">
          <p className="text-xs text-accent-gold">
            {details[heaviestIdx].dependents > 0
              ? `"${truncate(details[heaviestIdx].description, 40)}" is the most connected part of your system`
              : `"${truncate(details[heaviestIdx].description, 40)}" requires the most work`}
          </p>
        </div>
      )}

      {/* Mini complexity bar chart */}
      {details.length > 1 && (
        <div className="mt-3" data-testid="complexity-chart">
          <p className="text-xs text-atelier-text-secondary mb-1">Complexity by requirement:</p>
          <div className="space-y-1">
            {details.map((detail, i) => {
              const tier = getComplexityTier(detail.weight);
              const widthPct = Math.max(10, (detail.weight / maxWeight) * 100);
              const isHovered = hoveredReqIndex === i;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  onMouseEnter={() => setHoveredReqIndex(i)}
                  onMouseLeave={() => setHoveredReqIndex(null)}
                  data-testid={`bar-${i}`}
                >
                  <span className="text-xs text-atelier-text-muted w-16 truncate flex-shrink-0">
                    {truncate(detail.description, 8)}
                  </span>
                  <div className="flex-1 h-2 bg-atelier-bg/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${BAR_COLORS[tier]} ${
                        isHovered ? 'opacity-100' : 'opacity-70'
                      }`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}
