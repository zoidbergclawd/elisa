import type { TraceabilitySummary } from '../../types';

interface Props {
  traceability: TraceabilitySummary;
}

export default function ProofMeter({ traceability }: Props) {
  const { requirements, coverage } = traceability;
  const total = requirements.length;
  if (total === 0) return null;

  const passing = requirements.filter(r => r.status === 'passing').length;
  const failing = requirements.filter(r => r.status === 'failing').length;
  const untested = requirements.filter(r => r.status === 'untested').length;

  const passingPct = (passing / total) * 100;
  const failingPct = (failing / total) * 100;
  const untestedPct = (untested / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-2.5 flex rounded-full overflow-hidden bg-atelier-surface"
        role="progressbar"
        aria-valuenow={coverage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${passing} of ${total} requirements verified`}
      >
        {passingPct > 0 && (
          <div
            className="h-full bg-accent-mint transition-all duration-300"
            style={{ width: `${passingPct}%` }}
            title={`${passing} passing`}
          />
        )}
        {failingPct > 0 && (
          <div
            className="h-full bg-accent-coral transition-all duration-300"
            style={{ width: `${failingPct}%` }}
            title={`${failing} failing`}
          />
        )}
        {untestedPct > 0 && (
          <div
            className="h-full bg-amber-400 transition-all duration-300"
            style={{ width: `${untestedPct}%` }}
            title={`${untested} untested`}
          />
        )}
      </div>
      <span className="text-xs font-medium text-atelier-text whitespace-nowrap">
        {passing}/{total} proven
      </span>
    </div>
  );
}
