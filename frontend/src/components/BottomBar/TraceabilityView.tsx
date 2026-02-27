import type { TraceabilitySummary, TraceabilityStatus } from '../../types';
import ProofMeter from '../shared/ProofMeter';

interface Props {
  traceability: TraceabilitySummary | null;
}

function StatusBadge({ status }: { status: TraceabilityStatus }) {
  switch (status) {
    case 'passing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-mint/20 text-accent-mint">
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6l3 3 5-5" />
          </svg>
          PASS
        </span>
      );
    case 'failing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-coral/20 text-accent-coral">
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
          FAIL
        </span>
      );
    case 'untested':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/20 text-amber-400">
          ???
        </span>
      );
  }
}

export default function TraceabilityView({ traceability }: Props) {
  if (!traceability || traceability.requirements.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <p className="text-sm text-atelier-text-muted p-4">
          No requirement traceability data yet
        </p>
      </div>
    );
  }

  const { requirements } = traceability;

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Proof meter at top */}
      <ProofMeter traceability={traceability} />

      {/* Requirements table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-atelier-text-muted border-b border-border-subtle">
              <th className="pb-1.5 font-medium">Requirement</th>
              <th className="pb-1.5 font-medium">Test</th>
              <th className="pb-1.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr
                key={req.requirement_id}
                className="border-b border-border-subtle/50 last:border-b-0"
              >
                <td className="py-1.5 pr-2 text-atelier-text-secondary max-w-[200px] truncate" title={req.description}>
                  {req.description || req.requirement_id}
                </td>
                <td className="py-1.5 pr-2 text-atelier-text-muted font-mono max-w-[200px] truncate" title={req.test_name ?? ''}>
                  {req.test_name ?? (req.test_id ?? '--')}
                </td>
                <td className="py-1.5 text-right">
                  <StatusBadge status={req.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
