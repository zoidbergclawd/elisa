interface BoundaryItem {
  name: string;
  type: string;
  source?: string;
}

interface SystemBoundaryViewProps {
  inputs: BoundaryItem[];
  outputs: BoundaryItem[];
  boundary_portals: string[];
}

const TYPE_ICONS: Record<string, string> = {
  user_input: 'keyboard',
  portal_data: 'plug',
  hardware_signal: 'cpu',
  display: 'monitor',
  hardware_command: 'zap',
  data_output: 'send',
};

function getTypeLabel(type: string): string {
  return TYPE_ICONS[type] ?? type;
}

export default function SystemBoundaryView({ inputs, outputs, boundary_portals }: SystemBoundaryViewProps) {
  if (inputs.length === 0 && outputs.length === 0 && boundary_portals.length === 0) {
    return <p className="text-sm text-atelier-text-muted p-4">System boundary data will appear during a build</p>;
  }

  return (
    <div className="p-4 flex items-stretch gap-3 h-full min-h-0">
      {/* Inputs column */}
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-accent-sky mb-1.5 uppercase tracking-wider">Inputs</h4>
        <div className="space-y-1">
          {inputs.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-accent-sky" title={getTypeLabel(item.type)}>&#8594;</span>
              <span className="text-atelier-text-secondary truncate" title={item.name}>{item.name}</span>
            </div>
          ))}
          {inputs.length === 0 && (
            <span className="text-xs text-atelier-text-muted italic">No external inputs</span>
          )}
        </div>
      </div>

      {/* System box */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 border-x border-border-subtle">
        <div className="text-xs font-bold text-accent-lavender uppercase tracking-wider mb-1">Your System</div>
        {boundary_portals.length > 0 && (
          <div className="space-y-0.5">
            {boundary_portals.map((portal, i) => (
              <div key={i} className="text-[10px] text-accent-gold bg-accent-gold/10 rounded px-1.5 py-0.5 text-center">
                {portal}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outputs column */}
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-accent-mint mb-1.5 uppercase tracking-wider">Outputs</h4>
        <div className="space-y-1">
          {outputs.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-accent-mint" title={getTypeLabel(item.type)}>&#8594;</span>
              <span className="text-atelier-text-secondary truncate" title={item.name}>{item.name}</span>
            </div>
          ))}
          {outputs.length === 0 && (
            <span className="text-xs text-atelier-text-muted italic">No external outputs</span>
          )}
        </div>
      </div>
    </div>
  );
}
