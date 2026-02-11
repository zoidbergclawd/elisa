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

export default function ExamplePickerModal({ examples, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Choose a Nugget to Explore</h2>
          <p className="text-sm text-gray-500 mt-1">Pick an example to see how it works, or start from scratch.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {examples.map((example) => (
              <button
                key={example.id}
                data-testid={`example-card-${example.id}`}
                onClick={() => onSelect(example)}
                className={`${example.color} rounded-lg p-4 text-left hover:ring-2 hover:ring-gray-300 transition-shadow cursor-pointer`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className={`font-semibold ${example.accentColor}`}>{example.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-600">
                    {CATEGORY_LABELS[example.category]}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{example.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            or start with a blank canvas
          </button>
        </div>
      </div>
    </div>
  );
}
