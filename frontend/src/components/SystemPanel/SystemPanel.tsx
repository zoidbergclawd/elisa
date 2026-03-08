import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import BoundaryColumn from './BoundaryColumn';

export default function SystemPanel() {
  const { boundaryAnalysis } = useBuildSessionContext();

  if (!boundaryAnalysis) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="system-empty">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3 opacity-30">{'\u2B21'}</div>
          <p className="text-sm text-atelier-text-muted">
            System boundary analysis will appear here during a build.
          </p>
          <p className="text-xs text-atelier-text-muted mt-1 opacity-60">
            Inputs, outputs, and portal connections are detected automatically.
          </p>
        </div>
      </div>
    );
  }

  const { inputs, outputs, boundary_portals } = boundaryAnalysis;

  return (
    <div className="h-full flex flex-col p-5 gap-4">
      {/* Three-column layout */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Inputs column */}
        <BoundaryColumn
          title="Inputs"
          items={inputs}
          accentColor="sky"
          direction="in"
        />

        {/* System Core column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="text-xs font-semibold text-accent-lavender uppercase tracking-wider mb-3 px-1">
            System Core
          </h3>

          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-accent-lavender/20 bg-accent-lavender/5">
            <div className="text-sm font-bold text-accent-lavender uppercase tracking-wider mb-2">
              Your System
            </div>

            {boundary_portals.length > 0 ? (
              <div className="space-y-1.5 mt-1">
                {boundary_portals.map((portal, i) => (
                  <div
                    key={i}
                    className="text-xs text-accent-gold bg-accent-gold/10 border border-accent-gold/20 rounded-lg px-3 py-1.5 text-center shadow-sm"
                  >
                    {portal}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-atelier-text-muted italic mt-1">No portals</span>
            )}
          </div>
        </div>

        {/* Outputs column */}
        <BoundaryColumn
          title="Outputs"
          items={outputs}
          accentColor="mint"
          direction="out"
        />
      </div>
    </div>
  );
}
