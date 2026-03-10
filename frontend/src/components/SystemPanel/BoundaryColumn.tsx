interface BoundaryItem {
  name: string;
  type: string;
  source?: string;
}

interface BoundaryColumnProps {
  title: string;
  items: BoundaryItem[];
  accentColor: 'sky' | 'mint';
  direction: 'in' | 'out';
}

const TYPE_ICONS: Record<string, string> = {
  user_input: '\u2328',      // keyboard
  portal_data: '\u2693',     // anchor (plug)
  hardware_signal: '\u26A1', // lightning (cpu)
  display: '\u25A3',         // monitor
  hardware_command: '\u2699', // gear (zap)
  data_output: '\u27A4',     // arrow (send)
};

export default function BoundaryColumn({ title, items, accentColor, direction }: BoundaryColumnProps) {
  const accent = accentColor === 'sky'
    ? { heading: 'text-accent-sky', badge: 'bg-accent-sky/15 border-accent-sky/25 text-accent-sky', icon: 'text-accent-sky', glow: 'shadow-accent-sky/10' }
    : { heading: 'text-accent-mint', badge: 'bg-accent-mint/15 border-accent-mint/25 text-accent-mint', icon: 'text-accent-mint', glow: 'shadow-accent-mint/10' };

  const arrow = direction === 'in' ? '\u2192' : '\u2192';

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <h3 className={`text-xs font-semibold ${accent.heading} uppercase tracking-wider mb-3 px-1`}>
        {title}
      </h3>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-atelier-text-muted italic">
            No {title.toLowerCase()} detected
          </span>
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${accent.badge} shadow-sm ${accent.glow}`}
            >
              <span className={`text-sm ${accent.icon} flex-shrink-0`} aria-hidden="true">
                {TYPE_ICONS[item.type] ?? arrow}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">{item.name}</span>
                {item.source && (
                  <span className="text-[10px] opacity-70 truncate block">{item.source}</span>
                )}
              </div>
              <span className="text-[10px] opacity-50 flex-shrink-0 uppercase">{item.type.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
