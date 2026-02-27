interface ImpactPreviewProps {
  estimate: {
    estimated_tasks: number;
    complexity: 'simple' | 'moderate' | 'complex';
    heaviest_requirements: string[];
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

export default function ImpactPreview({ estimate }: ImpactPreviewProps) {
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
            {estimate.heaviest_requirements.map((req, i) => (
              <li key={i} className="truncate">- {req}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
