import type { ExampleNugget } from '../../lib/examples';

interface Props {
  examples: ExampleNugget[];
  onSelect: (example: ExampleNugget) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<ExampleNugget['category'], string> = {
  web: 'Web',
  hardware: 'Hardware',
  'multi-agent': 'Multi-Agent',
  game: 'Game',
};

const CATEGORY_COLORS: Record<ExampleNugget['category'], string> = {
  web: 'bg-accent-sky/20 text-accent-sky',
  hardware: 'bg-accent-coral/20 text-accent-coral',
  'multi-agent': 'bg-accent-lavender/20 text-accent-lavender',
  game: 'bg-accent-gold/20 text-accent-gold',
};

export default function ExamplePickerModal({ examples, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="examples-modal-title">
      <div className="glass-elevated rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-float-in">
        <div className="px-6 py-5 border-b border-border-subtle">
          <h2 id="examples-modal-title" className="text-xl font-display font-bold text-atelier-text">Choose a Nugget to Explore</h2>
          <p className="text-sm text-atelier-text-muted mt-1">Pick an example to see how it works, or start from scratch.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {examples.map((example) => (
              <button
                key={example.id}
                data-testid={`example-card-${example.id}`}
                onClick={() => onSelect(example)}
                className="bg-atelier-surface/70 rounded-xl p-4 text-left hover:bg-atelier-elevated border border-border-subtle hover:border-border-medium transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display font-semibold text-atelier-text group-hover:text-accent-gold transition-colors">
                    {example.name}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[example.category]}`}>
                    {CATEGORY_LABELS[example.category]}
                  </span>
                </div>
                <p className="text-sm text-atelier-text-secondary">{example.description}</p>
                {(example.skills.length > 0 || example.rules.length > 0) && (
                  <p className="text-xs text-atelier-text-muted mt-1">
                    {example.skills.length} skill{example.skills.length !== 1 ? 's' : ''}
                    {example.rules.length > 0 ? `, ${example.rules.length} rule${example.rules.length !== 1 ? 's' : ''}` : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-atelier-text-muted hover:text-atelier-text-secondary underline transition-colors"
          >
            or start with a blank canvas
          </button>
        </div>
      </div>
    </div>
  );
}
